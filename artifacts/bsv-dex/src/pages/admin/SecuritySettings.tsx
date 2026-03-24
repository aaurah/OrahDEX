import { useState } from "react";
import { Save, RefreshCw, Shield, Plus, Trash2, AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "auth" | "access" | "withdrawal" | "kyc_gates" | "sessions";

const TABS: { id: Tab; label: string }[] = [
  { id: "auth",       label: "Authentication" },
  { id: "access",     label: "Access Control" },
  { id: "withdrawal", label: "Withdrawal Security" },
  { id: "kyc_gates",  label: "KYC Gates" },
  { id: "sessions",   label: "Sessions & Tokens" },
];

const DEFAULT_SEC = {
  enforce2faAll: false,
  enforce2faWithdrawal: true,
  enforce2faAdmins: true,
  sessionTimeoutMin: 60,
  adminSessionTimeoutMin: 30,
  maxLoginAttempts: 5,
  lockoutDurationMin: 30,
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireNumbers: true,
  passwordRequireSymbols: false,
  passwordExpiryDays: 0,
  csrfProtection: true,
  rateLimitEnabled: true,
  rateLimitWindowMs: 60000,
  rateLimitMaxRequests: 100,
  ipWhitelist: [] as string[],
  blockedCountries: [] as string[],
  allowedIpRanges: [] as string[],
  withdrawalEmailConfirm: true,
  withdrawalSmsConfirm: false,
  withdrawalWhitelistOnly: false,
  withdrawalCooldownMin: 0,
  withdrawalMinConfirmations: 1,
  withdrawalDailyLimitNoKyc: "500",
  withdrawalDailyLimitKyc1: "5000",
  withdrawalDailyLimitKyc2: "50000",
  withdrawalDailyLimitKyc3: "500000",
  depositMinConfirmations: 1,
  antiPhishingEnabled: false,
  antiPhishingCode: "",
  loginNotifyEmail: true,
  loginNotifySuspicious: true,
  recaptchaEnabled: false,
  recaptchaSiteKey: "",
  recaptchaSecretKey: "",
  refreshTokenExpiryDays: 30,
  accessTokenExpiryMin: 60,
  jwtSecret: "",
};

type Sec = typeof DEFAULT_SEC;

function Toggle({ value, onChange, label, description, danger }: { value: boolean; onChange: (v: boolean) => void; label: string; description?: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-border last:border-0">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {danger && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/25">HIGH RISK</span>}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn("relative w-11 h-6 rounded-full border-2 transition-all duration-200 shrink-0", value ? (danger ? "bg-red-500 border-red-500" : "bg-primary border-primary") : "bg-muted/30 border-border")}
      >
        <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200", value ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

function NumberInput({ value, onChange, label, description, min, max, suffix }: { value: number; onChange: (v: number) => void; label: string; description?: string; min?: number; max?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-border last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          min={min}
          max={max}
          className="w-24 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {suffix && <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function StringInput({ value, onChange, label, description, placeholder }: { value: string; onChange: (v: string) => void; label: string; description?: string; placeholder?: string }) {
  return (
    <div className="py-4 border-b border-border last:border-0">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {description && <p className="text-xs text-muted-foreground mt-0.5 mb-2">{description}</p>}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

function ListInput({ items, setItems, label, description, placeholder }: { items: string[]; setItems: (v: string[]) => void; label: string; description?: string; placeholder?: string }) {
  const [val, setVal] = useState("");
  const add = () => { if (val.trim() && !items.includes(val.trim())) { setItems([...items, val.trim()]); setVal(""); } };
  return (
    <div className="py-4 border-b border-border last:border-0">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {description && <p className="text-xs text-muted-foreground mt-0.5 mb-3">{description}</p>}
      <div className="flex gap-2 mb-3">
        <input type="text" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder={placeholder} className="flex-1 bg-background border border-border rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        <button onClick={add} className="px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/20 transition-all">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No items added</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary border border-border text-xs text-foreground">
              {item}
              <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminSecuritySettings() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("auth");
  const [sec, setSec] = useState<Sec>(() => {
    try { return { ...DEFAULT_SEC, ...JSON.parse(localStorage.getItem("orahdex_security") ?? "{}") }; }
    catch { return DEFAULT_SEC; }
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Sec>(key: K) => (val: Sec[K]) => setSec(s => ({ ...s, [key]: val }));

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    localStorage.setItem("orahdex_security", JSON.stringify(sec));
    setSaving(false);
    toast({ title: "Security settings saved", description: "All security policies have been updated." });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 text-primary" /> Security Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Authentication, access control, withdrawal security, and session management</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50">
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save Security"}
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
        {tab === "auth" && (
          <>
            <Toggle value={sec.enforce2faAll} onChange={set("enforce2faAll")} label="Enforce 2FA for All Users" description="Force every user to set up TOTP before trading" danger />
            <Toggle value={sec.enforce2faWithdrawal} onChange={set("enforce2faWithdrawal")} label="Enforce 2FA for Withdrawals" description="Require 2FA verification before any withdrawal is processed" />
            <Toggle value={sec.enforce2faAdmins} onChange={set("enforce2faAdmins")} label="Enforce 2FA for Admins" description="Admin accounts must always use TOTP" />
            <Toggle value={sec.recaptchaEnabled} onChange={set("recaptchaEnabled")} label="Enable reCAPTCHA" description="Add Google reCAPTCHA v3 to login and registration forms" />
            {sec.recaptchaEnabled && (
              <>
                <StringInput value={sec.recaptchaSiteKey} onChange={set("recaptchaSiteKey")} label="reCAPTCHA Site Key" placeholder="6Lc..." />
                <StringInput value={sec.recaptchaSecretKey} onChange={set("recaptchaSecretKey")} label="reCAPTCHA Secret Key" placeholder="6Lc..." />
              </>
            )}
            <Toggle value={sec.loginNotifyEmail} onChange={set("loginNotifyEmail")} label="Email Login Notifications" description="Send an email when a new device logs into any account" />
            <Toggle value={sec.loginNotifySuspicious} onChange={set("loginNotifySuspicious")} label="Suspicious Login Alerts" description="Alert users when login is detected from a new country or IP" />
            <Toggle value={sec.antiPhishingEnabled} onChange={set("antiPhishingEnabled")} label="Anti-Phishing Code" description="Users set a personal code that appears in all emails to verify authenticity" />
            {sec.antiPhishingEnabled && (
              <StringInput value={sec.antiPhishingCode} onChange={set("antiPhishingCode")} label="Default Anti-Phishing Code" description="Admin default (users can override in their settings)" placeholder="SECURE-ORAH-2025" />
            )}
            <NumberInput value={sec.maxLoginAttempts} onChange={set("maxLoginAttempts")} label="Max Login Attempts" description="Lock account after this many consecutive failed logins" min={1} max={20} />
            <NumberInput value={sec.lockoutDurationMin} onChange={set("lockoutDurationMin")} label="Account Lockout Duration" min={1} suffix="minutes" />
            <NumberInput value={sec.passwordMinLength} onChange={set("passwordMinLength")} label="Minimum Password Length" min={6} max={32} suffix="chars" />
            <Toggle value={sec.passwordRequireUppercase} onChange={set("passwordRequireUppercase")} label="Require Uppercase Letter" description="Passwords must contain at least one uppercase letter" />
            <Toggle value={sec.passwordRequireNumbers} onChange={set("passwordRequireNumbers")} label="Require Number" description="Passwords must contain at least one number" />
            <Toggle value={sec.passwordRequireSymbols} onChange={set("passwordRequireSymbols")} label="Require Symbol" description="Passwords must contain at least one special character" />
            <NumberInput value={sec.passwordExpiryDays} onChange={set("passwordExpiryDays")} label="Password Expiry" description="Force users to change password after N days (0 = never)" min={0} suffix="days" />
          </>
        )}

        {tab === "access" && (
          <>
            <Toggle value={sec.rateLimitEnabled} onChange={set("rateLimitEnabled")} label="API Rate Limiting" description="Limit the number of API requests per window to prevent abuse" />
            {sec.rateLimitEnabled && (
              <>
                <NumberInput value={sec.rateLimitMaxRequests} onChange={set("rateLimitMaxRequests")} label="Max Requests per Window" min={1} />
                <NumberInput value={sec.rateLimitWindowMs / 1000} onChange={v => set("rateLimitWindowMs")(v * 1000)} label="Rate Limit Window" min={1} suffix="seconds" />
              </>
            )}
            <Toggle value={sec.csrfProtection} onChange={set("csrfProtection")} label="CSRF Protection" description="Enforce CSRF tokens on all state-changing requests" />
            <ListInput items={sec.ipWhitelist} setItems={set("ipWhitelist")} label="Admin IP Whitelist" description="Only these IPs can access the admin panel. Leave empty to allow all." placeholder="192.168.1.0/24" />
            <ListInput items={sec.allowedIpRanges} setItems={set("allowedIpRanges")} label="Allowed IP Ranges (Users)" description="Restrict all user access to these IP ranges" placeholder="10.0.0.0/8" />
            <ListInput items={sec.blockedCountries} setItems={set("blockedCountries")} label="Blocked Countries" description="ISO 3166-1 alpha-2 country codes blocked from accessing the exchange" placeholder="US, GB, CN" />
          </>
        )}

        {tab === "withdrawal" && (
          <>
            <Toggle value={sec.withdrawalEmailConfirm} onChange={set("withdrawalEmailConfirm")} label="Email Confirmation Required" description="Users must click a confirmation link in their email before withdrawal is processed" />
            <Toggle value={sec.withdrawalSmsConfirm} onChange={set("withdrawalSmsConfirm")} label="SMS Confirmation Required" description="Users must confirm via SMS OTP before withdrawal" />
            <Toggle value={sec.withdrawalWhitelistOnly} onChange={set("withdrawalWhitelistOnly")} label="Whitelist Addresses Only" description="Users can only withdraw to pre-approved addresses" danger />
            <NumberInput value={sec.withdrawalCooldownMin} onChange={set("withdrawalCooldownMin")} label="Withdrawal Cooldown" description="Minimum time between withdrawal requests (0 = no cooldown)" min={0} suffix="minutes" />
            <NumberInput value={sec.withdrawalMinConfirmations} onChange={set("withdrawalMinConfirmations")} label="Min. Blockchain Confirmations for Withdrawal" min={1} max={100} suffix="confirmations" />
            <NumberInput value={sec.depositMinConfirmations} onChange={set("depositMinConfirmations")} label="Min. Blockchain Confirmations for Deposit" min={1} max={100} suffix="confirmations" />
            <div className="pt-4">
              <p className="text-sm font-bold text-foreground mb-1">Daily Withdrawal Limits (USD equivalent)</p>
              <p className="text-xs text-muted-foreground mb-4">Applied based on user's KYC level</p>
              <div className="space-y-3">
                {[
                  ["withdrawalDailyLimitNoKyc", "No KYC"],
                  ["withdrawalDailyLimitKyc1", "KYC Level 1"],
                  ["withdrawalDailyLimitKyc2", "KYC Level 2"],
                  ["withdrawalDailyLimitKyc3", "KYC Level 3"],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center gap-4 p-3 bg-background rounded-xl border border-border">
                    <span className="text-sm font-medium text-foreground w-36 shrink-0">{label}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        value={(sec as any)[key]}
                        onChange={e => setSec(s => ({ ...s, [key]: e.target.value }))}
                        className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      />
                      <span className="text-xs text-muted-foreground">USD / day</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "kyc_gates" && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">Configure which actions require which KYC level to be completed.</p>
            {[
              { key: "kyc_spot",    label: "Spot Trading",            desc: "Required KYC level to open spot orders" },
              { key: "kyc_futures", label: "Futures / Leveraged",     desc: "Required KYC level for leveraged products" },
              { key: "kyc_p2p",     label: "P2P Marketplace",         desc: "Required KYC level for P2P trading" },
              { key: "kyc_fiat",    label: "Fiat On/Off Ramp",        desc: "Required KYC level for fiat deposits/withdrawals" },
              { key: "kyc_api",     label: "API Access",              desc: "Required KYC level to use the trading API" },
            ].map(item => (
              <div key={item.key} className="flex items-center gap-4 py-4 border-b border-border last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <select className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary shrink-0">
                  <option value="none">No KYC required</option>
                  <option value="level1">KYC Level 1 (ID)</option>
                  <option value="level2">KYC Level 2 (+ Address)</option>
                  <option value="level3">KYC Level 3 (+ Video)</option>
                </select>
              </div>
            ))}
          </div>
        )}

        {tab === "sessions" && (
          <>
            <NumberInput value={sec.sessionTimeoutMin} onChange={set("sessionTimeoutMin")} label="User Session Timeout" description="Idle session expires after this duration" min={5} suffix="minutes" />
            <NumberInput value={sec.adminSessionTimeoutMin} onChange={set("adminSessionTimeoutMin")} label="Admin Session Timeout" description="Admin panel session expires faster for security" min={5} suffix="minutes" />
            <NumberInput value={sec.accessTokenExpiryMin} onChange={set("accessTokenExpiryMin")} label="Access Token Expiry" description="JWT access token lifetime" min={1} suffix="minutes" />
            <NumberInput value={sec.refreshTokenExpiryDays} onChange={set("refreshTokenExpiryDays")} label="Refresh Token Expiry" description="Sliding session / refresh token lifetime" min={1} suffix="days" />
            <StringInput value={sec.jwtSecret} onChange={set("jwtSecret")} label="JWT Secret Override" description="Leave blank to use server-generated secret. Changing this invalidates all sessions." placeholder="my-super-secret-key-64-chars-minimum" />
          </>
        )}
      </div>
    </div>
  );
}
