import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, Shield, Zap } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";

const WALLETS = [
  { id: "handcash", name: "HandCash", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  { id: "relayx", name: "RelayX", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { id: "twetch", name: "Twetch", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  { id: "panda", name: "Panda Wallet", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  { id: "sensilet", name: "Sensilet", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
];

export function WalletConnectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const connect = useWalletStore((s) => s.connect);
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleConnect = (walletId: string) => {
    setConnecting(walletId);
    // Simulate connection delay
    setTimeout(() => {
      // Mock generated BSV address
      const mockAddress = `1${Math.random().toString(36).substring(2, 10)}...${Math.random().toString(36).substring(2, 6)}BSV`;
      connect(mockAddress, walletId);
      setConnecting(null);
      onClose();
    }, 1200);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Connect Wallet</h2>
                  <p className="text-sm text-muted-foreground mt-1">Connect your BSV wallet to start trading directly on-chain.</p>
                </div>
                <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <div className="grid gap-3">
                  {WALLETS.map((wallet) => (
                    <button
                      key={wallet.id}
                      onClick={() => handleConnect(wallet.id)}
                      disabled={!!connecting}
                      className={cn(
                        "flex items-center justify-between w-full p-4 rounded-xl border transition-all duration-200",
                        wallet.color,
                        "hover:bg-white/5 hover:border-primary/50",
                        connecting === wallet.id ? "opacity-70 scale-[0.98]" : "",
                        connecting && connecting !== wallet.id ? "opacity-40" : ""
                      )}
                    >
                      <div className="flex items-center gap-3 font-semibold">
                        <Wallet className="w-5 h-5" />
                        {wallet.name}
                      </div>
                      {connecting === wallet.id && (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex items-start gap-3 p-4 bg-primary/5 text-primary rounded-xl border border-primary/10">
                  <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <span className="font-semibold">Non-custodial Trading</span>
                    <p className="text-primary/80 mt-1">Your funds remain in your wallet until a trade is settled on the Bitcoin SV blockchain.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
