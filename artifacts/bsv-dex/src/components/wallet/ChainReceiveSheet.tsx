import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  chainName: string;
  symbol: string;
  address: string | null;
  hint?: string;
}

function QR({ address }: { address: string }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(address)}&size=220x220&bgcolor=ffffff&color=000000&margin=10&format=png`;
  return (
    <div className="w-52 h-52 rounded-2xl overflow-hidden border border-border bg-white flex items-center justify-center mx-auto">
      <img src={url} alt={`${address} QR`} className="w-full h-full object-cover" />
    </div>
  );
}

export function ChainReceiveSheet({ open, onClose, chainName, symbol, address, hint }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl pointer-events-auto overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <h3 className="text-base font-bold text-foreground">Receive {symbol}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{chainName} network</p>
                </div>
                <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5">
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {address ? (
                  <>
                    <QR address={address} />
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                        Your {symbol} address
                      </p>
                      <div className="flex items-stretch gap-2">
                        <div className="flex-1 px-3 py-2.5 bg-secondary border border-border rounded-xl font-mono text-xs text-foreground break-all leading-relaxed">
                          {address}
                        </div>
                        <button
                          onClick={copy}
                          className={cn(
                            "px-3 rounded-xl border text-sm font-medium flex items-center gap-1.5 shrink-0",
                            copied ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20",
                          )}
                        >
                          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/25 text-[11px] text-amber-300/90 leading-relaxed">
                      <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                      <span>Only send <strong>{symbol}</strong> on the <strong>{chainName}</strong> network. Sending another asset or another chain results in permanent loss.</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {hint ?? "Address not yet derived. Sign in to your sovereign wallet to reveal."}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
