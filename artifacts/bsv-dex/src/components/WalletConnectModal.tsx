import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Shield, ChevronRight, Wifi, CheckCircle2 } from "lucide-react";
import { useWalletStore, type WalletNetwork } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";

interface WalletDef {
  id: string;
  name: string;
  network: WalletNetwork;
  icon: string;
  description: string;
  popular?: boolean;
  chainId?: number;
}

const EVM_WALLETS: WalletDef[] = [
  {
    id: "metamask",
    name: "MetaMask",
    network: "evm",
    icon: "🦊",
    description: "Most popular Ethereum wallet",
    popular: true,
    chainId: 1,
  },
  {
    id: "walletconnect",
    name: "WalletConnect",
    network: "evm",
    icon: "🔗",
    description: "Connect any mobile wallet via QR",
    popular: true,
    chainId: 1,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    network: "evm",
    icon: "🔵",
    description: "Self-custody by Coinbase",
    popular: true,
    chainId: 1,
  },
  {
    id: "rainbow",
    name: "Rainbow",
    network: "evm",
    icon: "🌈",
    description: "Fun, simple Ethereum wallet",
    chainId: 1,
  },
  {
    id: "trust",
    name: "Trust Wallet",
    network: "evm",
    icon: "🛡️",
    description: "Multi-chain mobile wallet",
    chainId: 1,
  },
  {
    id: "okx",
    name: "OKX Wallet",
    network: "evm",
    icon: "⭕",
    description: "Web3 gateway by OKX exchange",
    chainId: 1,
  },
  {
    id: "bybit",
    name: "Bybit Wallet",
    network: "evm",
    icon: "🟡",
    description: "Web3 wallet by Bybit",
    chainId: 1,
  },
  {
    id: "phantom",
    name: "Phantom",
    network: "evm",
    icon: "👻",
    description: "Multichain — ETH, SOL, BTC",
    chainId: 1,
  },
  {
    id: "ledger",
    name: "Ledger",
    network: "evm",
    icon: "🔒",
    description: "Hardware wallet — cold storage",
    chainId: 1,
  },
  {
    id: "trezor",
    name: "Trezor",
    network: "evm",
    icon: "🛡️",
    description: "Open-source hardware wallet",
    chainId: 1,
  },
];

const BSV_WALLETS: WalletDef[] = [
  {
    id: "handcash",
    name: "HandCash",
    network: "bsv",
    icon: "✋",
    description: "Social BSV wallet",
    popular: true,
  },
  {
    id: "relayx",
    name: "RelayX",
    network: "bsv",
    icon: "⚡",
    description: "BSV DeFi wallet",
    popular: true,
  },
  {
    id: "panda",
    name: "Panda Wallet",
    network: "bsv",
    icon: "🐼",
    description: "Browser extension for BSV",
    popular: true,
  },
  {
    id: "twetch",
    name: "Twetch",
    network: "bsv",
    icon: "🐦",
    description: "Social + wallet on BSV",
  },
  {
    id: "sensilet",
    name: "Sensilet",
    network: "bsv",
    icon: "🔷",
    description: "sCrypt smart contract wallet",
  },
  {
    id: "yours",
    name: "Yours Wallet",
    network: "bsv",
    icon: "💛",
    description: "Open-source BSV wallet",
  },
];

type Tab = "evm" | "bsv";

function generateMockAddress(network: WalletNetwork): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  if (network === "evm") {
    const addr = Array.from({ length: 40 }, hex).join("");
    return `0x${addr}`;
  }
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return "1" + Array.from({ length: 33 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function WalletConnectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const connect = useWalletStore((s) => s.connect);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("evm");

  const handleConnect = (wallet: WalletDef) => {
    setConnecting(wallet.id);
    setTimeout(() => {
      setConnected(wallet.id);
      setTimeout(() => {
        const address = generateMockAddress(wallet.network);
        connect({
          address,
          provider: wallet.id,
          network: wallet.network,
          chainId: wallet.chainId,
        });
        setConnecting(null);
        setConnected(null);
        onClose();
      }, 700);
    }, 1000);
  };

  const wallets = tab === "evm" ? EVM_WALLETS : BSV_WALLETS;
  const popularWallets = wallets.filter((w) => w.popular);
  const otherWallets = wallets.filter((w) => !w.popular);

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
              className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Connect Wallet</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 italic">Always comes to Aura ✦</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Network Tabs */}
              <div className="flex gap-2 px-6 pt-4 shrink-0">
                <button
                  onClick={() => setTab("evm")}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                    tab === "evm"
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40 bg-transparent"
                  )}
                >
                  🌐 EVM / Web3
                </button>
                <button
                  onClick={() => setTab("bsv")}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                    tab === "bsv"
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40 bg-transparent"
                  )}
                >
                  ₿ Bitcoin SV
                </button>
              </div>

              {/* Network info pill */}
              <div className="px-6 pt-3 pb-2 shrink-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wifi className="w-3 h-3" />
                  {tab === "evm"
                    ? "Connecting on Ethereum Mainnet — all EVM-compatible chains supported"
                    : "Connecting on Bitcoin SV Mainnet — on-chain settlement via BSV script"}
                </div>
              </div>

              {/* Wallet List */}
              <div className="px-6 pb-4 overflow-y-auto flex-1">
                {popularWallets.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Popular</p>
                    <div className="grid gap-2">
                      {popularWallets.map((wallet) => (
                        <WalletButton
                          key={wallet.id}
                          wallet={wallet}
                          connecting={connecting}
                          connected={connected}
                          onConnect={handleConnect}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {otherWallets.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">More Wallets</p>
                    <div className="grid gap-2">
                      {otherWallets.map((wallet) => (
                        <WalletButton
                          key={wallet.id}
                          wallet={wallet}
                          connecting={connecting}
                          connected={connected}
                          onConnect={handleConnect}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-5 shrink-0">
                <div className="flex items-start gap-3 p-4 bg-primary/5 text-primary rounded-xl border border-primary/10">
                  <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">
                    <span className="font-semibold">Non-custodial & Trustless.</span>{" "}
                    Aura DEX never holds your funds. All trades settle directly on-chain — no registration, no KYC.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function WalletButton({
  wallet,
  connecting,
  connected,
  onConnect,
}: {
  wallet: WalletDef;
  connecting: string | null;
  connected: string | null;
  onConnect: (w: WalletDef) => void;
}) {
  const isConnecting = connecting === wallet.id;
  const isConnected = connected === wallet.id;
  const isDisabled = !!connecting;

  return (
    <button
      onClick={() => onConnect(wallet)}
      disabled={isDisabled}
      className={cn(
        "flex items-center justify-between w-full p-3.5 rounded-xl border transition-all duration-200 group",
        "border-border hover:border-primary/50 hover:bg-primary/5",
        isConnecting || isConnected ? "border-primary bg-primary/5 scale-[0.99]" : "",
        isDisabled && !isConnecting && !isConnected ? "opacity-40 cursor-not-allowed" : ""
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl w-8 text-center">{wallet.icon}</span>
        <div className="text-left">
          <div className="font-semibold text-sm text-foreground">{wallet.name}</div>
          <div className="text-xs text-muted-foreground">{wallet.description}</div>
        </div>
      </div>
      <div className="shrink-0">
        {isConnected ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : isConnecting ? (
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </div>
    </button>
  );
}
