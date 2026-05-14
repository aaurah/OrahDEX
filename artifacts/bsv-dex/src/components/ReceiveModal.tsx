import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, QrCode, ChevronDown, AlertTriangle, Wallet, ArrowRight, ArrowDown, Link2 } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { cn } from "@/lib/utils";

const NETWORKS = [
  { id: "evm-eth",     label: "Ethereum (ETH)",  symbol: "ETH",  color: "blue",   badge: "L1",      type: "evm" },
  { id: "evm-bsc",     label: "BNB Chain (BNB)",  symbol: "BNB",  color: "yellow", badge: "L1",      type: "evm" },
  { id: "evm-poly",    label: "Polygon (MATIC)",  symbol: "MATIC",color: "violet", badge: "L2",      type: "evm" },
  { id: "evm-arb",     label: "Arbitrum One",     symbol: "ETH",  color: "blue",   badge: "L2",      type: "evm" },
  { id: "evm-op",      label: "Optimism",         symbol: "ETH",  color: "red",    badge: "L2",      type: "evm" },
  { id: "evm-base",    label: "Base",             symbol: "ETH",  color: "blue",   badge: "L2",      type: "evm" },
  { id: "evm-zk",      label: "zkSync Era",       symbol: "ETH",  color: "violet", badge: "L3",      type: "evm" },
  { id: "evm-sepolia", label: "Sepolia Testnet",  symbol: "ETH",  color: "violet", badge: "Testnet", type: "evm" },
  { id: "bsv",         label: "Bitcoin SV (BSV)", symbol: "BSV",  color: "amber",  badge: "BSV",     type: "bsv" },
];

const BADGE_COLOR: Record<string, string> = {
  blue:    "bg-blue-500/10 text-blue-400 border-blue-500/30",
  yellow:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  violet:  "bg-violet-500/10 text-violet-400 border-violet-500/30",
  red:     "bg-red-500/10 text-red-400 border-red-500/30",
  amber:   "bg-green-500/10 text-green-400 border-green-500/30",
  testnet: "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

function QRCodeImage({ address }: { address: string }) {
  const [failed, setFailed] = useState(false);
  const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(address)}&size=180x180&bgcolor=0d1117&color=ffffff&margin=10&format=png`;
  return (
    <div className="w-44 h-44 rounded-2xl overflow-hidden border border-border bg-white flex items-center justify-center mx-auto">
      {failed ? (
        <div className="flex flex-col items-center justify-center w-full h-full bg-card gap-2">
          <span className="text-3xl">📱</span>
          <span className="text-xs text-muted-foreground text-center px-3">Scan in your wallet app</span>
        </div>
      ) : (
        <img
          src={url}
          alt="Wallet QR Code"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export function ReceiveModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { address, network } = useWalletStore();
  const { open: openWalletModal } = useWalletModalStore();

  const [selectedNet, setSelectedNet] = useState(network === "bsv" ? "bsv" : "evm-eth");
  const [copied, setCopied] = useState(false);
  const [netOpen, setNetOpen] = useState(false);
  const [bsvManual, setBsvManual] = useState("");

  const currentNet = NETWORKS.find(n => n.id === selectedNet) ?? NETWORKS[0];
  const isBsvSelected = currentNet.type === "bsv";
  const isEvmWallet = network === "evm";
  const isBsvWallet = network === "bsv";

  const showAddressMismatch = isBsvSelected && !isBsvWallet && !!address;
  const activeAddress = (() => {
    if (!address) return null;
    if (isBsvSelected && isBsvWallet) return address;
    if (isBsvSelected && !isBsvWallet) return bsvManual || null;
    if (!isBsvSelected && isEvmWallet) return address;
    return address;
  })();

  const handleCopy = () => {
    if (!activeAddress) return;
    navigator.clipboard?.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectBsv = () => {
    onClose();
    setTimeout(() => openWalletModal(), 150);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl pointer-events-auto overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                    <ArrowDown className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Receive Crypto</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Share your wallet address to receive funds directly on-chain
                    </p>
                  </div>
                </div>
                <button onClick={handleClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                  <span className="text-primary font-semibold">Non-custodial.</span> Funds sent to this address go directly to your wallet. OrahDEX never holds your assets.
                </div>

                <div className="relative">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Network</p>
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
                            onClick={() => { setSelectedNet(n.id); setNetOpen(false); setBsvManual(""); }}
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

                {showAddressMismatch ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/25">
                      <AlertTriangle className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-300/90 leading-relaxed">
                        <p className="font-semibold text-amber-300 mb-1">EVM address cannot receive BSV</p>
                        Your connected EVM wallet uses a different address format (0x…). BSV requires a native Bitcoin SV address.
                      </div>
                    </div>
                    <button
                      onClick={handleConnectBsv}
                      className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-green-500/10 border border-green-500/30 hover:border-green-500/50 hover:bg-green-500/15 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                          <Wallet className="w-4 h-4 text-green-400" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-green-300">Connect BSV Wallet</p>
                          <p className="text-[11px] text-green-400/70">HandCash · RelayX · Panda · manual address</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-green-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">or paste address</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Your BSV Address</p>
                      <input
                        value={bsvManual}
                        onChange={e => setBsvManual(e.target.value)}
                        placeholder="e.g. 1FsBsvAddressExample..."
                        className="w-full px-4 py-3 bg-secondary border border-border rounded-xl font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-all"
                      />
                    </div>
                    {bsvManual.trim().length > 10 && (
                      <>
                        <QRCodeImage address={bsvManual.trim()} />
                        <div className="flex items-stretch gap-2">
                          <div className="flex-1 px-3 py-2.5 bg-secondary border border-border rounded-xl font-mono text-xs text-foreground break-all leading-relaxed">
                            {bsvManual.trim()}
                          </div>
                          <button
                            onClick={handleCopy}
                            className={cn(
                              "px-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-1.5 shrink-0",
                              copied ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                            )}
                          >
                            {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {activeAddress ? (
                      <QRCodeImage address={activeAddress} />
                    ) : (
                      <div className="space-y-3">
                        <div className="w-44 h-44 rounded-2xl border border-dashed border-border bg-secondary/50 flex flex-col items-center justify-center mx-auto gap-2">
                          <QrCode className="w-10 h-10 text-muted-foreground/40" />
                          <p className="text-xs text-muted-foreground text-center px-4">Connect wallet to see QR</p>
                        </div>
                        {!address && (
                          <button
                            onClick={handleConnectBsv}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/15 transition-all"
                          >
                            <Link2 className="w-4 h-4" />
                            Connect Wallet
                          </button>
                        )}
                      </div>
                    )}
                    {activeAddress && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Your Wallet Address</p>
                        <div className="flex items-stretch gap-2">
                          <div className="flex-1 px-3 py-2.5 bg-secondary border border-border rounded-xl font-mono text-xs text-foreground break-all leading-relaxed">
                            {activeAddress}
                          </div>
                          <button
                            onClick={handleCopy}
                            className={cn(
                              "px-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-1.5 shrink-0",
                              copied ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                            )}
                          >
                            {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="p-4 rounded-xl bg-green-500/8 border border-green-500/20 text-xs text-green-300/80 leading-relaxed">
                  ⚠️ <strong className="text-green-300">Only send {currentNet.symbol} on the {currentNet.label} network</strong> to this address. Wrong asset or network = permanent loss.
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
