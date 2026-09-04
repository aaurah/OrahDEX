/**
 * ManualImportSheet — hybrid imToken / Guarda / Atomic / MetaMask style
 * bottom-sheet for linking a chain address or importing a private key.
 *
 * Two modes:
 *   Watch Address — paste any public address (receive-only, balance visible)
 *   Private Key   — paste WIF or hex key; backend derives + returns the address
 *                   The key itself is NEVER stored anywhere.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Eye, KeyRound, CheckCircle2, AlertCircle, Loader2,
  ArrowRight, Trash2, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChainFamily = "evm" | "bsv" | "btc" | "bch" | "tron" | "solana" | "xrp" | "ltc" | "doge";

export interface ImportChain {
  id: string;
  name: string;
  symbol: string;
  color: string;
  family: ChainFamily;
}

interface Props {
  open: boolean;
  chain: ImportChain | null;
  existingAddress?: string | null;
  onClose: () => void;
  onSave:   (chain: ImportChain, address: string) => void;
  onRemove: (chain: ImportChain) => void;
}

// ─── Address validation ───────────────────────────────────────────────────────

function isValidAddress(family: ChainFamily, raw: string): boolean {
  const a = raw.trim();
  switch (family) {
    case "evm":    return /^0x[0-9a-fA-F]{40}$/.test(a);
    case "bsv":    return /^1[1-9A-HJ-NP-Za-km-z]{24,33}$/.test(a);
    case "btc":    return /^(1[1-9A-HJ-NP-Za-km-z]{24,33}|3[1-9A-HJ-NP-Za-km-z]{24,33}|bc1[a-zA-HJ-NP-Z0-9]{25,89})$/.test(a);
    case "bch":    return /^(bitcoincash:[qp][0-9a-z]{41}|[qp][0-9a-z]{41}|1[1-9A-HJ-NP-Za-km-z]{24,33})$/i.test(a);
    case "solana": return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
    case "tron":   return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
    case "xrp":    return /^r[1-9A-HJ-NP-Za-km-z]{24,33}$/.test(a);
    case "ltc":    return /^(L[a-km-zA-HJ-NP-Z1-9]{26,33}|M[a-km-zA-HJ-NP-Z1-9]{26,33}|ltc1[a-z0-9]{25,87})$/.test(a);
    case "doge":   return /^D[5-9A-HJ-NP-Za-km-z]{33}$/.test(a);
    default:       return a.length >= 10;
  }
}

// ─── Placeholder text per chain ───────────────────────────────────────────────

const PLACEHOLDERS: Record<ChainFamily, { address: string; key: string }> = {
  evm:    { address: "0x…  EVM address",                  key: "64-char hex private key"                  },
  bsv:    { address: "1…  P2PKH BSV address",             key: "WIF key (starts with K, L, or 5)"         },
  btc:    { address: "bc1q… / 1… / 3…",                  key: "WIF key (starts with K, L, or 5)"         },
  bch:    { address: "bitcoincash:q… or 1…",              key: "WIF key (starts with K, L, or 5)"         },
  solana: { address: "Base58 Solana address",              key: "32-byte or 64-byte hex key"               },
  tron:   { address: "T…  Tron address (34 chars)",       key: "64-char hex private key"                  },
  xrp:    { address: "r…  XRP Ledger address",            key: "Not yet supported — paste address instead"},
  ltc:    { address: "L… / M… / ltc1…",                  key: "WIF key (starts with T or 6)"             },
  doge:   { address: "D…  Dogecoin address",              key: "WIF key (starts with Q or 6)"             },
};

const KEY_UNSUPPORTED: ChainFamily[] = ["xrp"];

// ─── Component ────────────────────────────────────────────────────────────────

export function ManualImportSheet({ open, chain, existingAddress, onClose, onSave, onRemove }: Props) {
  const [mode, setMode]             = useState<"address" | "key">("address");
  const [input, setInput]           = useState("");
  const [addrValid, setAddrValid]   = useState(false);
  const [derivedAddr, setDerivedAddr] = useState<string | null>(null);
  const [deriving, setDeriving]     = useState(false);
  const [error, setError]           = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const reset = () => {
    setMode("address");
    setInput("");
    setAddrValid(false);
    setDerivedAddr(null);
    setDeriving(false);
    setError("");
    setConfirmRemove(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const switchMode = (m: "address" | "key") => {
    setMode(m);
    setInput("");
    setAddrValid(false);
    setDerivedAddr(null);
    setError("");
  };

  const handleInput = (val: string) => {
    setInput(val);
    setDerivedAddr(null);
    setError("");
    if (mode === "address") {
      setAddrValid(val.trim().length > 0 && isValidAddress(chain!.family, val.trim()));
    }
  };

  const deriveFromKey = async () => {
    if (!chain) return;
    setDeriving(true);
    setError("");
    setDerivedAddr(null);
    try {
      const res  = await fetch(`${API_BASE}/wallet/derive-from-key`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ family: chain.family, privateKey: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not derive address");
      setDerivedAddr(data.address);
    } catch (e: any) {
      setError(e.message ?? "Failed to derive address");
    } finally {
      setDeriving(false);
    }
  };

  const handleSave = () => {
    if (!chain) return;
    const addr = mode === "address" ? input.trim() : derivedAddr;
    if (!addr) return;
    onSave(chain, addr);
    reset();
  };

  const handleRemove = () => {
    if (!chain) return;
    onRemove(chain);
    reset();
  };

  if (!chain) return null;

  const ph = PLACEHOLDERS[chain.family];
  const keySupported = !KEY_UNSUPPORTED.includes(chain.family);
  const canSave = mode === "address" ? addrValid : !!derivedAddr;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-[200] rounded-t-3xl bg-card border-t border-border shadow-2xl max-h-[92vh] flex flex-col"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border/70" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border shrink-0">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm text-white shadow-lg shrink-0"
                style={{ background: `linear-gradient(135deg, ${chain.color}cc, ${chain.color})` }}
              >
                {chain.symbol.slice(0, 3)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-foreground">Link {chain.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {existingAddress
                    ? `Currently: ${existingAddress.slice(0, 10)}…${existingAddress.slice(-5)}`
                    : "No address linked — watch or import to unlock"}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Mode switcher */}
              <div className="flex gap-1 p-1 bg-secondary/40 rounded-2xl">
                <button
                  onClick={() => switchMode("address")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    mode === "address"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Eye size={14} /> Watch Address
                </button>
                {keySupported && (
                  <button
                    onClick={() => switchMode("key")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                      mode === "key"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <KeyRound size={14} /> Private Key
                  </button>
                )}
              </div>

              {/* Info banners */}
              {mode === "address" && (
                <div className="flex gap-2 p-3 rounded-xl bg-primary/8 border border-primary/20 text-xs text-muted-foreground leading-relaxed">
                  <Eye size={13} className="text-primary shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground">Watch-only:</strong> See your balance and receive funds.
                    Signing transactions on this device requires importing the private key.
                  </span>
                </div>
              )}

              {mode === "key" && (
                <div className="flex gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/25 text-xs text-amber-200/80 leading-relaxed">
                  <ShieldAlert size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Your key is used <strong>only to compute your address</strong> and is never stored or sent anywhere.
                    Only import keys you own.
                  </span>
                </div>
              )}

              {/* Input */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {mode === "address" ? `${chain.name} Public Address` : `${chain.name} Private Key`}
                </label>
                <textarea
                  value={input}
                  onChange={e => handleInput(e.target.value)}
                  placeholder={mode === "address" ? ph.address : ph.key}
                  autoComplete="off"
                  spellCheck={false}
                  rows={3}
                  className={cn(
                    "w-full px-3.5 py-3 rounded-xl border bg-secondary/40 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-2 transition-all",
                    error
                      ? "border-red-500/60 focus:ring-red-500/25"
                      : mode === "address" && addrValid
                      ? "border-green-500/50 focus:ring-green-500/25"
                      : "border-border focus:ring-primary/25",
                  )}
                />

                {/* Validation feedback */}
                {mode === "address" && addrValid && !error && (
                  <p className="flex items-center gap-1.5 text-xs text-green-400">
                    <CheckCircle2 size={12} /> Valid {chain.name} address format
                  </p>
                )}
                {error && (
                  <p className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertCircle size={12} /> {error}
                  </p>
                )}
              </div>

              {/* Derive button */}
              {mode === "key" && !derivedAddr && (
                <button
                  onClick={deriveFromKey}
                  disabled={deriving || !input.trim()}
                  className="w-full py-3 rounded-xl border border-border bg-secondary/60 hover:bg-secondary text-sm font-semibold text-foreground disabled:opacity-40 flex items-center justify-center gap-2 transition-all"
                >
                  {deriving
                    ? <><Loader2 size={15} className="animate-spin" /> Deriving address…</>
                    : "Derive My Address"}
                </button>
              )}

              {/* Derived address preview */}
              {mode === "key" && derivedAddr && (
                <div className="p-3.5 rounded-xl bg-green-500/8 border border-green-500/25 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                    <span className="text-xs font-semibold text-green-400">Address derived successfully</span>
                  </div>
                  <p className="font-mono text-[11px] text-foreground break-all leading-relaxed">{derivedAddr}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Confirm this matches your expected address before saving.
                  </p>
                </div>
              )}

              {/* Primary save button */}
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-35 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <ArrowRight size={16} />
                {mode === "address" ? "Link Address" : "Save Address"}
              </button>

              {/* Remove / unlink */}
              {existingAddress && (
                <div>
                  {!confirmRemove ? (
                    <button
                      onClick={() => setConfirmRemove(true)}
                      className="w-full py-2.5 rounded-xl border border-red-500/25 text-xs font-semibold text-red-400/80 hover:bg-red-500/8 hover:text-red-400 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Trash2 size={12} /> Unlink this address
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmRemove(false)}
                        className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary/60 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRemove}
                        className="flex-1 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-bold text-red-400 hover:bg-red-500/25 transition-all"
                      >
                        Confirm Unlink
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Safe padding for iOS home bar */}
              <div className="h-4" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
