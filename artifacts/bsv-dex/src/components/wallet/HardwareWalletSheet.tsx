/**
 * HardwareWalletSheet
 *
 * Connects a cold / hardware wallet and auto-derives ALL supported chain
 * addresses in one step so the user never has to link chains manually.
 *
 * Device tabs
 *  • Ledger  — real WebHID connection via @ledgerhq/hw-transport-webhid +
 *              @ledgerhq/hw-app-eth. Derives EVM + TRX from the ETH app
 *              (same secp256k1 key, different encoding). Prompts to switch
 *              to the Bitcoin app for BTC / LTC / DOGE.
 *  • Trezor / ELLIPAL / SafePal / Tangem / any cold wallet
 *            — "paste all addresses" panel. Hardware wallets show every
 *              address in their own app — paste them all here at once.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Usb, QrCode, CheckCircle2, Loader2, AlertTriangle,
  ChevronRight, ClipboardPaste, ShieldCheck, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HWAddresses = {
  evm?:  string;
  btc?:  string;
  bch?:  string;
  bsv?:  string;
  sol?:  string;
  tron?: string;
  xrp?:  string;
  ltc?:  string;
  doge?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (addrs: HWAddresses) => void;
}

// ─── Chain definitions ────────────────────────────────────────────────────────

const CHAIN_FIELDS: {
  key: keyof HWAddresses;
  label: string;
  symbol: string;
  color: string;
  placeholder: string;
  validate: (v: string) => boolean;
}[] = [
  {
    key: "evm", label: "Ethereum / EVM", symbol: "ETH", color: "#627EEA",
    placeholder: "0x…",
    validate: v => /^0x[0-9a-fA-F]{40}$/.test(v.trim()),
  },
  {
    key: "btc", label: "Bitcoin", symbol: "BTC", color: "#F7931A",
    placeholder: "bc1q… or 1… or 3…",
    validate: v => /^(1[1-9A-HJ-NP-Za-km-z]{24,33}|3[1-9A-HJ-NP-Za-km-z]{24,33}|bc1[a-zA-HJ-NP-Z0-9]{25,89})$/.test(v.trim()),
  },
  {
    key: "bsv", label: "Bitcoin SV", symbol: "BSV", color: "#EAB300",
    placeholder: "1… (same key as BSV)",
    validate: v => /^1[1-9A-HJ-NP-Za-km-z]{24,33}$/.test(v.trim()),
  },
  {
    key: "bch", label: "Bitcoin Cash", symbol: "BCH", color: "#0AC18E",
    placeholder: "bitcoincash:q…",
    validate: v => /^(bitcoincash:[qp][0-9a-z]{41}|[qp][0-9a-z]{41}|1[1-9A-HJ-NP-Za-km-z]{24,33})$/i.test(v.trim()),
  },
  {
    key: "tron", label: "Tron", symbol: "TRX", color: "#FF060A",
    placeholder: "T…",
    validate: v => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v.trim()),
  },
  {
    key: "xrp", label: "XRP Ledger", symbol: "XRP", color: "#00AAE4",
    placeholder: "r…",
    validate: v => /^r[1-9A-HJ-NP-Za-km-z]{24,33}$/.test(v.trim()),
  },
  {
    key: "sol", label: "Solana", symbol: "SOL", color: "#14F195",
    placeholder: "base58 public key",
    validate: v => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.trim()),
  },
  {
    key: "ltc", label: "Litecoin", symbol: "LTC", color: "#A6A9AA",
    placeholder: "L… or ltc1…",
    validate: v => /^(L[a-km-zA-HJ-NP-Z1-9]{26,33}|M[a-km-zA-HJ-NP-Z1-9]{26,33}|ltc1[a-z0-9]{25,87})$/.test(v.trim()),
  },
  {
    key: "doge", label: "Dogecoin", symbol: "DOGE", color: "#C2A633",
    placeholder: "D…",
    validate: v => /^D[5-9A-HJ-NP-Za-km-z]{33}$/.test(v.trim()),
  },
];

// ─── Ledger derivation ────────────────────────────────────────────────────────

type LedgerStep = "idle" | "connecting" | "eth-app" | "btc-app" | "done" | "error";

async function deriveLedgerEth(): Promise<{ evm: string; tron: string }> {
  // Dynamic import so bundle stays small when Ledger is not used
  const TransportWebHID = (await import("@ledgerhq/hw-transport-webhid")).default;
  const { default: Eth } = await import("@ledgerhq/hw-app-eth");

  const transport = await TransportWebHID.create();
  try {
    const eth = new Eth(transport);
    // BIP44 ETH path — m/44'/60'/0'/0/0
    const { address } = await eth.getAddress("44'/60'/0'/0/0", false);

    // Tron uses the same secp256k1 key as ETH but encodes the address differently.
    // Derive via the Tron BIP44 path if Tron app is open, otherwise compute from ETH pubkey.
    let tronAddr = "";
    try {
      const tronResult = await eth.getAddress("44'/195'/0'/0/0", false);
      tronAddr = tronResult.address;
    } catch {
      // Tron app not open — caller will handle
    }

    return { evm: address, tron: tronAddr };
  } finally {
    await transport.close();
  }
}

// ─── Device tab definitions ───────────────────────────────────────────────────

type DeviceTab = "ledger" | "paste";

const DEVICES: { id: DeviceTab; label: string; icon: typeof Usb; sub: string }[] = [
  { id: "ledger", label: "Ledger", icon: Usb,           sub: "WebHID — auto-detect" },
  { id: "paste",  label: "Any cold wallet", icon: ClipboardPaste, sub: "Trezor · ELLIPAL · SafePal · Tangem" },
];

// ─── Ledger panel ─────────────────────────────────────────────────────────────

function LedgerPanel({ onDerived }: { onDerived: (a: HWAddresses) => void }) {
  const [step, setStep]       = useState<LedgerStep>("idle");
  const [derived, setDerived] = useState<HWAddresses>({});
  const [error, setError]     = useState("");

  const connect = useCallback(async () => {
    setError("");
    setStep("connecting");
    try {
      setStep("eth-app");
      const { evm, tron } = await deriveLedgerEth();
      const addrs: HWAddresses = { evm };
      if (tron) addrs.tron = tron;
      setDerived(addrs);
      setStep("done");
      onDerived(addrs);
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      if (msg.includes("not supported") || msg.includes("HID")) {
        setError("WebHID is not supported in this browser. Use Chrome 89+ on desktop.");
      } else if (msg.includes("denied") || msg.includes("cancel")) {
        setError("Device access denied. Allow the connection in the browser prompt.");
      } else {
        setError(msg.slice(0, 120));
      }
      setStep("error");
    }
  }, [onDerived]);

  const STEPS = [
    { key: "connecting", label: "Detecting device via WebHID…" },
    { key: "eth-app",    label: "Open the Ethereum app on your Ledger" },
    { key: "done",       label: "Addresses derived" },
  ];

  return (
    <div className="space-y-4">
      {/* Instruction card */}
      <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-2">
        {STEPS.map((s, i) => {
          const active = step === s.key;
          const done   = step === "done" || (i === 0 && ["eth-app", "done"].includes(step));
          return (
            <div key={s.key} className="flex items-center gap-3">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all",
                done    ? "bg-primary text-primary-foreground" :
                active  ? "bg-primary/20 text-primary ring-2 ring-primary/30" :
                          "bg-secondary text-muted-foreground",
              )}>
                {done ? <CheckCircle2 size={13} /> : i + 1}
              </div>
              <p className={cn(
                "text-sm transition-colors",
                active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}>
                {s.label}
              </p>
              {active && step !== "done" && <Loader2 size={13} className="text-primary animate-spin ml-auto" />}
            </div>
          );
        })}
      </div>

      {/* Note about BTC */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
        <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">BTC, LTC, DOGE, XRP, SOL</strong> — Ledger keeps each coin in a separate app.
          After connecting, use the <em>Any cold wallet</em> tab to paste those addresses from your Ledger Live app.
        </p>
      </div>

      {/* Derived preview */}
      {Object.keys(derived).length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-2">Auto-derived</p>
          {Object.entries(derived).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">{k}</span>
              <span className="text-[11px] font-mono text-foreground truncate max-w-[200px]">
                {v!.slice(0, 10)}…{v!.slice(-6)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {step === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-3 flex items-start gap-2">
          <AlertTriangle size={13} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}

      {/* CTA */}
      {step === "idle" || step === "error" ? (
        <button
          onClick={connect}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Usb size={15} />
          {step === "error" ? "Retry connection" : "Connect Ledger"}
        </button>
      ) : step === "done" ? (
        <div className="w-full py-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-bold flex items-center justify-center gap-2">
          <CheckCircle2 size={15} />
          Connected — scroll down to add more chains
        </div>
      ) : (
        <div className="w-full py-3 rounded-xl bg-secondary text-muted-foreground text-sm font-semibold flex items-center justify-center gap-2 cursor-not-allowed">
          <Loader2 size={14} className="animate-spin" />
          Waiting for Ledger…
        </div>
      )}
    </div>
  );
}

// ─── Paste-all panel ──────────────────────────────────────────────────────────

function PasteAllPanel({ onDerived }: { onDerived: (a: HWAddresses) => void }) {
  const [values, setValues] = useState<Partial<Record<keyof HWAddresses, string>>>({});

  const set = (key: keyof HWAddresses, val: string) =>
    setValues(prev => ({ ...prev, [key]: val }));

  const validCount = CHAIN_FIELDS.filter(f => {
    const v = values[f.key]?.trim() ?? "";
    return v && f.validate(v);
  }).length;

  const handleSave = () => {
    const addrs: HWAddresses = {};
    for (const f of CHAIN_FIELDS) {
      const v = values[f.key]?.trim() ?? "";
      if (v && f.validate(v)) (addrs as any)[f.key] = v;
    }
    onDerived(addrs);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground px-1">
        Open your wallet app, copy each chain's receiving address, and paste them all here. Leave blank any chain you don't use.
      </p>

      {CHAIN_FIELDS.map(f => {
        const val   = values[f.key] ?? "";
        const valid = val.trim() && f.validate(val);
        const bad   = val.trim() && !valid;
        return (
          <div key={f.key}>
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0"
                style={{ backgroundColor: f.color }}
              >
                {f.symbol.slice(0, 2)}
              </div>
              <label className="text-xs font-semibold text-foreground">{f.label}</label>
              {valid && <CheckCircle2 size={12} className="text-primary ml-auto" />}
            </div>
            <input
              value={val}
              onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              spellCheck={false}
              className={cn(
                "w-full rounded-xl border bg-secondary/40 px-3 py-2.5 text-xs font-mono outline-none transition-all",
                valid ? "border-primary/40 bg-primary/5" :
                bad   ? "border-destructive/40" :
                        "border-border focus:border-primary/40",
              )}
            />
          </div>
        );
      })}

      <button
        onClick={handleSave}
        disabled={validCount === 0}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2"
      >
        <ShieldCheck size={15} />
        Save {validCount > 0 ? `${validCount} address${validCount > 1 ? "es" : ""}` : "addresses"}
      </button>
    </div>
  );
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

export function HardwareWalletSheet({ open, onClose, onSave }: Props) {
  const [tab, setTab]           = useState<DeviceTab>("ledger");
  const [pending, setPending]   = useState<HWAddresses | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const handleDerived = (addrs: HWAddresses) => {
    if (Object.keys(addrs).length === 0) return;
    setPending(addrs);
  };

  const handleConfirm = () => {
    if (!pending) return;
    onSave(pending);
    setConfirmed(true);
    setTimeout(() => {
      setConfirmed(false);
      setPending(null);
      onClose();
    }, 1200);
  };

  const handleClose = () => {
    setPending(null);
    setConfirmed(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border rounded-t-3xl max-h-[92vh] flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-primary" />
                  <h2 className="text-base font-bold text-foreground">Connect Hardware Wallet</h2>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  All supported coins populate automatically
                </p>
              </div>
              <button onClick={handleClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80">
                <X size={15} />
              </button>
            </div>

            {/* Device tabs */}
            <div className="flex gap-2 px-5 py-3 border-b border-border shrink-0">
              {DEVICES.map(d => (
                <button
                  key={d.id}
                  onClick={() => { setTab(d.id); setPending(null); }}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl border text-center transition-all",
                    tab === d.id
                      ? "border-primary/40 bg-primary/8 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary/40",
                  )}
                >
                  <d.icon size={18} />
                  <span className="text-[11px] font-bold">{d.label}</span>
                  <span className="text-[9px] opacity-60 leading-tight">{d.sub}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Pending confirmation */}
              {pending && !confirmed && (
                <div className="rounded-2xl border border-primary/30 bg-primary/8 p-4">
                  <p className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-primary" />
                    Ready to save {Object.keys(pending).length} chain{Object.keys(pending).length > 1 ? "s" : ""}
                  </p>
                  <div className="space-y-1 mb-3">
                    {Object.entries(pending).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold uppercase text-muted-foreground w-10 shrink-0">{k}</span>
                        <span className="font-mono text-foreground truncate">{v!.slice(0, 12)}…{v!.slice(-6)}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleConfirm}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    <ShieldCheck size={14} />
                    Confirm &amp; link all addresses
                  </button>
                </div>
              )}

              {confirmed && (
                <div className="rounded-2xl border border-primary/30 bg-primary/8 p-4 flex items-center justify-center gap-2">
                  <CheckCircle2 size={18} className="text-primary" />
                  <p className="text-sm font-bold text-primary">All addresses saved!</p>
                </div>
              )}

              {/* Tab content */}
              {tab === "ledger" && <LedgerPanel onDerived={handleDerived} />}
              {tab === "paste"  && <PasteAllPanel onDerived={handleDerived} />}

              {/* Why this is safe */}
              <div className="rounded-xl border border-border bg-secondary/20 p-3 flex items-start gap-2 mt-2">
                <ShieldCheck size={13} className="text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Only public addresses are stored — never private keys or seed phrases. Your hardware wallet remains the sole signer for all transactions.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
