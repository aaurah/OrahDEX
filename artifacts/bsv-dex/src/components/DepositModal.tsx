import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, QrCode, ChevronDown } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";

const NETWORKS = [
  { id: "evm-eth",   label: "Ethereum (ETH)",  symbol: "ETH",  color: "blue",   badge: "L1" },
  { id: "evm-bsc",   label: "BNB Chain (BNB)",  symbol: "BNB",  color: "yellow", badge: "L1" },
  { id: "evm-poly",  label: "Polygon (MATIC)",  symbol: "MATIC",color: "violet", badge: "L2" },
  { id: "evm-arb",   label: "Arbitrum One",     symbol: "ETH",  color: "blue",   badge: "L2" },
  { id: "evm-op",    label: "Optimism",         symbol: "ETH",  color: "red",    badge: "L2" },
  { id: "evm-base",  label: "Base",             symbol: "ETH",  color: "blue",   badge: "L2" },
  { id: "evm-zk",    label: "zkSync Era",       symbol: "ETH",  color: "violet", badge: "L3" },
  { id: "bsv",       label: "Bitcoin SV (BSV)", symbol: "BSV",  color: "amber",  badge: "BSV" },
];

const BADGE_COLOR: Record<string, string> = {
  blue:   "bg-blue-500/10 text-blue-400 border-blue-500/30",
  yellow: "bg-green-500/10 text-green-400 border-green-500/30",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  red:    "bg-red-500/10 text-red-400 border-red-500/30",
  amber:  "bg-green-500/10 text-green-400 border-green-500/30",
};

function QRCodeImage({ address }: { address: string }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(address)}&size=180x180&bgcolor=0d1117&color=ffffff&margin=10&format=png`;
  return (
    <div className="w-44 h-44 rounded-2xl overflow-hidden border border-border bg-white flex items-center justify-center mx-auto">
      <img
        src={url}
        alt="Wallet QR Code"
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
          (e.target as HTMLImageElement).parentElement!.innerHTML =
            `<div class="flex flex-col items-center justify-center w-full h-full bg-card gap-2"><span class="text-3xl">📱</span><span class="text-xs text-muted-foreground text-center px-3">Scan address in your wallet app</span></div>`;
        }}
      />
    </div>
  );
}

export function DepositModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { address, network } = useWalletStore();
  const [selectedNet, setSelectedNet] = useState(network === "bsv" ? "bsv" : "evm-eth");
  const [copied, setCopied] = useState(false);
  const [netOpen, setNetOpen] = useState(false);

  const currentNet = NETWORKS.find(n => n.id === selectedNet) ?? NETWORKS[0];
  const displayAddress = address ?? "Connect your wallet first";

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl pointer-events-auto overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center">
                    <QrCode className="w-4.5 h-4.5 text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Deposit Funds</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Send crypto to your wallet address</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Network selector */}
                <div className="relative">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Deposit Network</p>
                  <button
                    onClick={() => setNetOpen(o => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-secondary border border-border rounded-xl text-sm font-medium hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border", BADGE_COLOR[currentNet.color])}>
                        {currentNet.badge}
                      </span>
                      <span>{currentNet.label}</span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", netOpen && "rotate-180")} />
                  </button>
                  <AnimatePresence>
                    {netOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-10 overflow-hidden"
                      >
                        {NETWORKS.map(n => (
                          <button
                            key={n.id}
                            onClick={() => { setSelectedNet(n.id); setNetOpen(false); }}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors text-left",
                              selectedNet === n.id && "bg-primary/10 text-primary"
                            )}
                          >
                            <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0", BADGE_COLOR[n.color])}>
                              {n.badge}
                            </span>
                            {n.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* QR Code */}
                {address ? (
                  <QRCodeImage address={address} />
                ) : (
                  <div className="w-44 h-44 rounded-2xl border border-dashed border-border bg-secondary/50 flex flex-col items-center justify-center mx-auto gap-2">
                    <QrCode className="w-10 h-10 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground text-center px-4">Connect wallet to see QR</p>
                  </div>
                )}

                {/* Address */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Your Wallet Address</p>
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 px-3 py-2.5 bg-secondary border border-border rounded-xl font-mono text-xs text-foreground break-all leading-relaxed">
                      {displayAddress}
                    </div>
                    <button
                      onClick={handleCopy}
                      disabled={!address}
                      className={cn(
                        "px-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-1.5 shrink-0",
                        address
                          ? copied
                            ? "bg-green-500/15 border-green-500/40 text-green-400"
                            : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                          : "bg-secondary border-border text-muted-foreground/40 cursor-not-allowed"
                      )}
                    >
                      {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>

                {/* Warning */}
                <div className="p-4 rounded-xl bg-green-500/8 border border-green-500/20 text-xs text-green-300/80 leading-relaxed">
                  ⚠️ <strong className="text-green-300">Only send {currentNet.symbol} on the {currentNet.label} network</strong> to this address.
                  Sending the wrong asset or using the wrong network will result in permanent loss of funds.
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
