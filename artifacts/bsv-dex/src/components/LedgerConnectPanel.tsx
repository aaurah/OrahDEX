import { useState, useCallback } from "react";
import {
  Usb, ChevronRight, Check, AlertTriangle, Loader2,
  RefreshCw, ExternalLink, Shield, ChevronDown, ChevronUp,
  Cpu, Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isDMKSupported, dmkConnect, dmkDeriveAccounts, dmkDisconnect,
  dmkErrMsg, DMK_DEFAULT_PATHS,
  type DMKSession, type DMKAccount,
} from "@/lib/ledgerDMK";
import type { LedgerStatus } from "@/lib/ledgerHardware";

interface LedgerConnectPanelProps {
  onConnected: (address: string, path: string) => void;
}

// ── step meta ─────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, icon: Usb,    title: "Plug in your Ledger",     desc: "Connect via USB and enter your PIN." },
  { id: 2, icon: Cpu,    title: "Open Ethereum app",        desc: "On the device: go to Ethereum and open it." },
  { id: 3, icon: Shield, title: "Allow browser access",     desc: "Click 'Connect Device' and select your Ledger." },
];

// ── short address helper ──────────────────────────────────────────────────────
function shortAddr(addr: string) { return `${addr.slice(0, 8)}…${addr.slice(-6)}`; }

export function LedgerConnectPanel({ onConnected }: LedgerConnectPanelProps) {
  const [status,   setStatus]   = useState<LedgerStatus>("idle");
  const [error,    setError]    = useState<string | null>(null);
  const [accounts, setAccounts] = useState<DMKAccount[]>([]);
  const [session,  setSession]  = useState<DMKSession | null>(null);
  const [showMore, setShowMore] = useState(false);

  const webHIDSupported = isDMKSupported();

  // ── connect & derive ───────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setError(null);
    setAccounts([]);
    setStatus("connecting");
    try {
      const s = await dmkConnect();
      setSession(s);
      setStatus("awaiting_app");
      setStatus("deriving");
      const accs = await dmkDeriveAccounts(s.sessionId, DMK_DEFAULT_PATHS.slice(0, 5));
      if (accs.length === 0) throw new Error("0x6700");   // Eth app not open
      setAccounts(accs);
      setStatus("ready");
    } catch (err) {
      setError(dmkErrMsg(err));
      setStatus("error");
      if (session) dmkDisconnect(session.sessionId).catch(() => {});
      setSession(null);
    }
  }, [session]);

  // ── load more accounts ─────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!session) return;
    setStatus("deriving");
    try {
      const more = await dmkDeriveAccounts(session.sessionId, DMK_DEFAULT_PATHS.slice(5));
      setAccounts(a => {
        const existing = new Set(a.map(x => x.address));
        return [...a, ...more.filter(m => !existing.has(m.address))];
      });
      setShowMore(true);
      setStatus("ready");
    } catch (err) {
      setError(dmkErrMsg(err));
      setStatus("error");
    }
  }, [session]);

  // ── select address ─────────────────────────────────────────────────────────
  const pick = useCallback((acc: DMKAccount) => {
    if (session) dmkDisconnect(session.sessionId).catch(() => {});
    onConnected(acc.address, acc.path);
  }, [session, onConnected]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#142533]/80 border border-[#1d3a50] flex items-center justify-center shrink-0">
          <LedgerLogo className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-base font-bold">Connect Ledger</h3>
          <p className="text-xs text-muted-foreground">
            {webHIDSupported ? "Direct USB connection — no Ledger Live needed" : "Via Ledger Live (WalletConnect)"}
          </p>
        </div>
      </div>

      {/* Browser fallback notice */}
      {!webHIDSupported && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Your browser doesn't support direct USB connection. Use&nbsp;
            <a href="https://www.ledger.com/ledger-live" target="_blank" rel="noreferrer" className="underline font-medium">Ledger Live</a>
            &nbsp;and connect via WalletConnect below, or switch to Chrome / Edge.
          </span>
        </div>
      )}

      {/* Steps */}
      {webHIDSupported && status === "idle" && (
        <div className="space-y-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-sm font-semibold">{s.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connecting / deriving states */}
      {(status === "connecting" || status === "awaiting_app" || status === "deriving") && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-[#142533]/80 border border-[#1d3a50] flex items-center justify-center">
              <LedgerLogo className="w-9 h-9" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold">
              {status === "connecting" ? "Requesting device access…" :
               status === "awaiting_app" ? "Waiting for Ethereum app…" :
               "Deriving accounts…"}
            </p>
            <p className="text-xs text-muted-foreground">
              {status === "connecting" ? "Select your Ledger in the browser popup." :
               status === "awaiting_app" ? "Open the Ethereum app on your device." :
               "Reading addresses from device — this takes a few seconds."}
            </p>
          </div>
          <div className="flex gap-1 mt-2">
            {[0, 150, 300].map(delay => (
              <span key={delay} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {status === "error" && error && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 px-3.5 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
          <div className="text-xs text-muted-foreground space-y-1 px-1">
            <p className="font-semibold text-foreground">Quick checklist:</p>
            <p>• Ledger is connected via USB and unlocked (PIN entered)</p>
            <p>• Ethereum app is open on the device</p>
            <p>• Ledger Live is closed (USB can't be shared)</p>
            <p>• "Allow Ledger Manager" is not blocking USB</p>
          </div>
        </div>
      )}

      {/* Account list */}
      {status === "ready" && accounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select an account</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {accounts.map(acc => (
              <button
                key={acc.address}
                onClick={() => pick(acc)}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
              >
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{acc.label}</p>
                  <p className="text-sm font-mono font-semibold mt-0.5">{shortAddr(acc.address)}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{acc.path}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </button>
            ))}
          </div>

          {/* Load more (legacy paths) */}
          {!showMore && (
            <button
              onClick={loadMore}
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
            >
              {(status as string) === "deriving" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
              Load more accounts (legacy paths)
            </button>
          )}
        </div>
      )}

      {/* Connect / Retry CTA */}
      {webHIDSupported && (status === "idle" || status === "error") && (
        <button
          onClick={connect}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-[#142533] border border-[#1d3a50] hover:bg-[#1d3a50] text-white font-semibold text-sm transition-colors"
        >
          {status === "error" ? <RefreshCw className="w-4 h-4" /> : <Usb className="w-4 h-4" />}
          {status === "error" ? "Retry Connection" : "Connect Device"}
        </button>
      )}

      {/* Divider + Ledger Live WC fallback */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-[11px] text-muted-foreground">or connect via Ledger Live</span>
        </div>
      </div>

      <a
        href="ledgerlive://wc"
        target="_blank"
        rel="noreferrer"
        className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-border hover:bg-muted/50 text-sm font-medium transition-colors"
      >
        <Wifi className="w-4 h-4 text-muted-foreground" />
        Open in Ledger Live
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
      </a>

      <p className="text-[10px] text-center text-muted-foreground px-2 leading-relaxed">
        Your private keys never leave the device. OrahDEX only reads your public address.
      </p>
    </div>
  );
}

// ── Ledger wordmark SVG icon ──────────────────────────────────────────────────
function LedgerLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" aria-label="Ledger">
      <rect width="100" height="100" rx="18" fill="#142533" />
      {/* Stylised L shape */}
      <rect x="20" y="20" width="14" height="46" fill="#00BFFF" rx="3" />
      <rect x="20" y="52" width="46" height="14" fill="#00BFFF" rx="3" />
      {/* Top-right corner mark */}
      <rect x="66" y="20" width="14" height="20" fill="#00BFFF" rx="3" />
      <rect x="55" y="20" width="14" height="14" fill="#00BFFF" rx="3" />
      {/* Bottom-right corner mark */}
      <rect x="66" y="66" width="14" height="14" fill="#00BFFF" rx="3" />
    </svg>
  );
}
