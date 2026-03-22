import { useState } from "react";
import {
  Link2, Shield, Percent, Zap, DollarSign, Bell,
  Activity, Lock, LogOut, Info, FileText, ExternalLink, ChevronRight,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";

const BASE_URL = window.location.origin;

function Row({
  icon: Icon, iconColor = "#EAB308", label, value, onClick, rightEl, danger = false,
}: {
  icon: any; iconColor?: string; label: string; value?: string;
  onClick?: () => void; rightEl?: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      className="flex items-center gap-3 px-4 py-3.5 w-full text-left"
      onClick={onClick}
    >
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
    </button>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${value ? "bg-primary/60" : "bg-muted"}`}
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
  const [notifications, setNotifications] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [biometrics, setBiometrics] = useState(false);

  const handleDisconnect = () => {
    if (window.confirm("Disconnect your wallet?")) disconnect();
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
          <Row icon={Link2} label="Connect Wallet" value="Tap to connect your wallet" />
        )}
      </Section>

      <Section title="Trading">
        <Row icon={Percent} label="Default Slippage" value="0.5%" />
        <Row icon={Zap} label="Default Leverage" value="10x" />
        <Row icon={DollarSign} label="Quote Currency" value="USDT" />
      </Section>

      <Section title="Preferences">
        <Row
          icon={Bell}
          label="Price Alerts"
          rightEl={<Toggle value={notifications} onChange={setNotifications} />}
        />
        <Row
          icon={Activity}
          label="Haptic Feedback"
          rightEl={<Toggle value={haptics} onChange={setHaptics} />}
        />
        <Row
          icon={Lock}
          label="Biometric Lock"
          rightEl={<Toggle value={biometrics} onChange={setBiometrics} />}
        />
      </Section>

      <Section title="Admin">
        <Row
          icon={Shield}
          iconColor="#8B5CF6"
          label="Admin Panel"
          value="Platform management & controls"
          onClick={() => window.open(`${BASE_URL}/admin`, "_blank")}
          rightEl={<ExternalLink size={14} className="text-muted-foreground shrink-0" />}
        />
      </Section>

      <Section title="About">
        <Row icon={Info} label="Version" value="1.0.0" />
        <Row icon={FileText} label="Terms of Service" onClick={() => {}} />
        <Row icon={Shield} label="Privacy Policy" onClick={() => {}} />
      </Section>

      {/* Branding */}
      <div className="flex flex-col items-center py-8 px-4">
        <p className="text-2xl font-bold text-foreground">
          Orah<span className="text-primary">DEX</span>
        </p>
        <p className="text-xs text-primary mt-1 opacity-80">✦ Trade means DEX</p>
        <p className="text-[11px] text-muted-foreground mt-2">Non-custodial · On-chain settlement · BSV</p>
      </div>
    </div>
  );
}
