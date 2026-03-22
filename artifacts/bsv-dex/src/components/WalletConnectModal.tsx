import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Shield, ChevronRight, Wifi, CheckCircle2,
  PlusCircle, Download, Link2, Copy, Check,
  Eye, EyeOff, AlertTriangle, RefreshCw, ArrowLeft,
} from "lucide-react";
import { useWalletStore, type WalletNetwork } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";
import { generateMnemonic, deriveAddress, validateMnemonic } from "@/lib/seedPhrase";

interface WalletDef {
  id: string; name: string; network: WalletNetwork;
  icon: string; description: string; popular?: boolean; chainId?: number;
}

const EVM_WALLETS: WalletDef[] = [
  { id: "metamask", name: "MetaMask", network: "evm", icon: "🦊", description: "Most popular Ethereum wallet", popular: true, chainId: 1 },
  { id: "walletconnect", name: "WalletConnect", network: "evm", icon: "🔗", description: "Connect any mobile wallet via QR", popular: true, chainId: 1 },
  { id: "coinbase", name: "Coinbase Wallet", network: "evm", icon: "🔵", description: "Self-custody by Coinbase", popular: true, chainId: 1 },
  { id: "rainbow", name: "Rainbow", network: "evm", icon: "🌈", description: "Fun, simple Ethereum wallet", chainId: 1 },
  { id: "trust", name: "Trust Wallet", network: "evm", icon: "🛡️", description: "Multi-chain mobile wallet", chainId: 1 },
  { id: "okx", name: "OKX Wallet", network: "evm", icon: "⭕", description: "Web3 gateway by OKX exchange", chainId: 1 },
  { id: "bybit", name: "Bybit Wallet", network: "evm", icon: "🟡", description: "Web3 wallet by Bybit", chainId: 1 },
  { id: "phantom", name: "Phantom", network: "evm", icon: "👻", description: "Multichain — ETH, SOL, BTC", chainId: 1 },
  { id: "ledger", name: "Ledger", network: "evm", icon: "🔒", description: "Hardware wallet — cold storage", chainId: 1 },
  { id: "trezor", name: "Trezor", network: "evm", icon: "🛡️", description: "Open-source hardware wallet", chainId: 1 },
];

const BSV_WALLETS: WalletDef[] = [
  { id: "handcash", name: "HandCash", network: "bsv", icon: "✋", description: "Social BSV wallet", popular: true },
  { id: "relayx", name: "RelayX", network: "bsv", icon: "⚡", description: "BSV DeFi wallet", popular: true },
  { id: "panda", name: "Panda Wallet", network: "bsv", icon: "🐼", description: "Browser extension for BSV", popular: true },
  { id: "twetch", name: "Twetch", network: "bsv", icon: "🐦", description: "Social + wallet on BSV" },
  { id: "sensilet", name: "Sensilet", network: "bsv", icon: "🔷", description: "sCrypt smart contract wallet" },
  { id: "yours", name: "Yours Wallet", network: "bsv", icon: "💛", description: "Open-source BSV wallet" },
];

type View = "landing" | "create" | "import" | "connect";
type ConnectTab = "evm" | "bsv";
type CreateStep = "generate" | "confirm" | "done";
type ImportStep = "enter" | "done";

function generateMockAddress(network: WalletNetwork): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  if (network === "evm") return `0x${Array.from({ length: 40 }, hex).join("")}`;
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return "1" + Array.from({ length: 33 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function getEthereumProvider(walletId: string): any {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    if (walletId === "metamask") return eth.providers.find((p: any) => p.isMetaMask) ?? null;
    if (walletId === "coinbase") return eth.providers.find((p: any) => p.isCoinbaseWallet) ?? null;
    return eth.providers[0];
  }
  if (walletId === "metamask") return eth.isMetaMask ? eth : null;
  if (walletId === "coinbase") return eth.isCoinbaseWallet ? eth : null;
  if (walletId === "trust") return eth.isTrust ? eth : null;
  if (walletId === "okx") return (window as any).okxwallet ?? (eth.isOKExWallet ? eth : null);
  return eth;
}

function isWalletInstalled(walletId: string): boolean {
  const eth = (window as any).ethereum;
  if (!eth) return false;
  switch (walletId) {
    case "metamask": return !!(eth.isMetaMask || eth.providers?.some((p: any) => p.isMetaMask));
    case "coinbase": return !!(eth.isCoinbaseWallet || eth.providers?.some((p: any) => p.isCoinbaseWallet));
    case "trust": return !!eth.isTrust;
    case "okx": return !!(window as any).okxwallet || !!eth.isOKExWallet;
    case "bybit": return !!eth.isBybit;
    case "phantom": return !!(window as any).phantom?.ethereum;
    default: return !!eth;
  }
}

const WALLET_INSTALL_URLS: Record<string, string> = {
  metamask: "https://metamask.io/download/",
  coinbase: "https://www.coinbase.com/wallet/downloads",
  rainbow: "https://rainbow.me/",
  trust: "https://trustwallet.com/download",
  okx: "https://www.okx.com/web3",
  bybit: "https://www.bybit.com/en/web3/",
  phantom: "https://phantom.app/download",
  ledger: "https://www.ledger.com/ledger-live",
  trezor: "https://trezor.io/start",
  walletconnect: null as any,
};

const METAMASK_MOBILE_DEEPLINK = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;

export function WalletConnectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const connect = useWalletStore((s) => s.connect);
  const [view, setView] = useState<View>("landing");
  const [connectTab, setConnectTab] = useState<ConnectTab>("evm");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [createStep, setCreateStep] = useState<CreateStep>("generate");
  const [createNetwork, setCreateNetwork] = useState<WalletNetwork>("bsv");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [importInput, setImportInput] = useState("");
  const [importNetwork, setImportNetwork] = useState<WalletNetwork>("bsv");
  const [importStep, setImportStep] = useState<ImportStep>("enter");
  const [importError, setImportError] = useState<string | null>(null);
  const [importAddress, setImportAddress] = useState("");

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setView("landing");
      setCreateStep("generate");
      setImportStep("enter");
      setMnemonic([]);
      setRevealed(false);
      setCopied(false);
      setConfirmed(false);
      setImportInput("");
      setImportError(null);
    }, 400);
  };

  const handleConnectWallet = useCallback(async (wallet: WalletDef) => {
    setConnectError(null);

    // ── EVM wallets (MetaMask, Coinbase, Trust, etc.) ──────────────────────
    if (wallet.network === "evm") {
      // WalletConnect — future integration placeholder
      if (wallet.id === "walletconnect") {
        setConnectError("WalletConnect deep link coming soon. Use MetaMask or another installed wallet for now.");
        return;
      }

      // Phantom uses its own provider namespace
      const phantomEth = (window as any).phantom?.ethereum;
      if (wallet.id === "phantom" && phantomEth) {
        setConnecting(wallet.id);
        try {
          const accounts: string[] = await phantomEth.request({ method: "eth_requestAccounts" });
          const rawChain: string = await phantomEth.request({ method: "eth_chainId" });
          connect({ address: accounts[0], provider: "phantom", network: "evm", chainId: parseInt(rawChain, 16) });
          setConnecting(null);
          handleClose();
        } catch (err: any) {
          setConnecting(null);
          setConnectError(err?.code === 4001 ? "Connection rejected in Phantom." : (err?.message ?? "Phantom connection failed."));
        }
        return;
      }

      // OKX has its own namespace too
      const okxProvider = (window as any).okxwallet;
      if (wallet.id === "okx" && okxProvider) {
        setConnecting(wallet.id);
        try {
          const accounts: string[] = await okxProvider.request({ method: "eth_requestAccounts" });
          const rawChain: string = await okxProvider.request({ method: "eth_chainId" });
          connect({ address: accounts[0], provider: "okx", network: "evm", chainId: parseInt(rawChain, 16) });
          setConnecting(null);
          handleClose();
        } catch (err: any) {
          setConnecting(null);
          setConnectError(err?.code === 4001 ? "Connection rejected in OKX Wallet." : (err?.message ?? "OKX connection failed."));
        }
        return;
      }

      // Standard EIP-1193 provider (MetaMask, Coinbase, Trust, Rainbow, Bybit, Ledger…)
      const provider = getEthereumProvider(wallet.id);

      if (!provider) {
        // Not installed — guide user to install or open mobile app
        if (wallet.id === "metamask" && isMobileDevice()) {
          window.open(METAMASK_MOBILE_DEEPLINK, "_blank");
          return;
        }
        const installUrl = WALLET_INSTALL_URLS[wallet.id];
        if (installUrl) {
          window.open(installUrl, "_blank");
        } else {
          setConnectError(`${wallet.name} is not installed. Install it and refresh this page.`);
        }
        return;
      }

      setConnecting(wallet.id);
      try {
        // Request account access — this triggers the wallet popup
        const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
        if (!accounts?.length) throw new Error("No accounts returned from wallet.");

        const rawChain: string = await provider.request({ method: "eth_chainId" });
        const chainId = parseInt(rawChain, 16);

        connect({ address: accounts[0], provider: wallet.id, network: "evm", chainId });

        // Listen for account/chain changes
        provider.on?.("accountsChanged", (accs: string[]) => {
          if (accs.length === 0) useWalletStore.getState().disconnect();
          else connect({ address: accs[0], provider: wallet.id, network: "evm", chainId });
        });
        provider.on?.("chainChanged", (chainHex: string) => {
          connect({ address: accounts[0], provider: wallet.id, network: "evm", chainId: parseInt(chainHex, 16) });
        });

        setConnecting(null);
        setConnected(wallet.id);
        setTimeout(() => { setConnected(null); handleClose(); }, 800);
      } catch (err: any) {
        setConnecting(null);
        if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
          setConnectError("You rejected the connection request. Try again and approve it in your wallet.");
        } else if (err?.code === -32002) {
          setConnectError("A connection request is already pending. Open your wallet app and approve it.");
        } else {
          setConnectError(err?.message ?? "Connection failed. Make sure your wallet is unlocked and try again.");
        }
      }
      return;
    }

    // ── BSV wallets ─────────────────────────────────────────────────────────
    // BSV wallets don't have a browser standard yet — simulate connection
    setConnecting(wallet.id);
    setTimeout(() => {
      setConnected(wallet.id);
      setTimeout(() => {
        connect({ address: generateMockAddress("bsv"), provider: wallet.id, network: "bsv" });
        setConnecting(null); setConnected(null);
        handleClose();
      }, 700);
    }, 1200);
  }, [connect, handleClose]);

  const startCreate = (network: WalletNetwork) => {
    setCreateNetwork(network);
    setMnemonic(generateMnemonic(wordCount));
    setCreateStep("generate");
    setRevealed(false);
    setCopied(false);
    setConfirmed(false);
    setView("create");
  };

  const regenerate = () => {
    setMnemonic(generateMnemonic(wordCount));
    setCopied(false);
    setRevealed(false);
    setConfirmed(false);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(mnemonic.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const finishCreate = () => {
    const address = deriveAddress(mnemonic, createNetwork);
    connect({ address, provider: "aura-wallet", network: createNetwork });
    setCreateStep("done");
    setTimeout(() => handleClose(), 2000);
  };

  const handleImport = () => {
    const result = validateMnemonic(importInput);
    if (!result.valid) { setImportError(result.error ?? "Invalid phrase"); return; }
    setImportError(null);
    const addr = deriveAddress(result.words, importNetwork);
    setImportAddress(addr);
    connect({ address: addr, provider: "aura-wallet", network: importNetwork });
    setImportStep("done");
    setTimeout(() => handleClose(), 2000);
  };

  const wallets = connectTab === "evm" ? EVM_WALLETS : BSV_WALLETS;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  {view !== "landing" && (
                    <button onClick={() => setView("landing")}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5 transition-colors">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      {view === "landing" && "Get Started"}
                      {view === "create" && "Create New Wallet"}
                      {view === "import" && "Import Wallet"}
                      {view === "connect" && "Connect Wallet"}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5 italic">Always comes to Orah DEX ✦</p>
                  </div>
                </div>
                <button onClick={handleClose}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">

                  {/* ── LANDING ── */}
                  {view === "landing" && (
                    <motion.div key="landing" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                      className="p-6 space-y-3">
                      <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                        Non-custodial · On-chain settlement · No registration required
                      </p>

                      {/* Create New */}
                      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-5 hover:border-primary/40 transition-all cursor-pointer group"
                        onClick={() => setView("create")}>
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
                            <PlusCircle className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-foreground text-base">Create New Wallet</h3>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                              Generate a new wallet with a secure 12 or 24-word seed phrase. Works on BSV and EVM chains.
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                        </div>
                        <div className="flex gap-2 mt-4">
                          <span className="px-2.5 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">BIP39</span>
                          <span className="px-2.5 py-1 bg-white/5 text-muted-foreground text-xs font-medium rounded-full">BSV</span>
                          <span className="px-2.5 py-1 bg-white/5 text-muted-foreground text-xs font-medium rounded-full">EVM</span>
                        </div>
                      </div>

                      {/* Import */}
                      <div className="rounded-2xl border border-border bg-gradient-to-br from-violet-500/5 to-transparent p-5 hover:border-violet-500/40 transition-all cursor-pointer group"
                        onClick={() => setView("import")}>
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0 group-hover:bg-violet-500/25 transition-colors">
                            <Download className="w-5 h-5 text-violet-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-foreground text-base">Import Existing Wallet</h3>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                              Restore access using your 12 or 24-word seed phrase from any BIP39-compatible wallet.
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-400 shrink-0 mt-0.5 transition-colors" />
                        </div>
                        <div className="flex gap-2 mt-4">
                          <span className="px-2.5 py-1 bg-violet-500/10 text-violet-400 text-xs font-semibold rounded-full">Seed Phrase</span>
                          <span className="px-2.5 py-1 bg-white/5 text-muted-foreground text-xs font-medium rounded-full">12 or 24 words</span>
                        </div>
                      </div>

                      {/* Connect Wallet */}
                      <div className="rounded-2xl border border-border bg-gradient-to-br from-blue-500/5 to-transparent p-5 hover:border-blue-500/40 transition-all cursor-pointer group"
                        onClick={() => setView("connect")}>
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0 group-hover:bg-blue-500/25 transition-colors">
                            <Link2 className="w-5 h-5 text-blue-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-foreground text-base">Connect Existing Wallet</h3>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                              Link MetaMask, WalletConnect, HandCash, RelayX, and 12+ other wallets.
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                        </div>
                        <div className="flex gap-2 mt-4">
                          {["🦊", "🔗", "✋", "⚡", "🐼"].map((e) => (
                            <span key={e} className="text-xl">{e}</span>
                          ))}
                          <span className="text-sm text-muted-foreground self-center">+11 more</span>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-4 bg-primary/5 text-primary rounded-xl border border-primary/10 mt-2">
                        <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                        <p className="text-xs leading-relaxed">
                          <span className="font-semibold">Non-custodial & Trustless.</span>{" "}
                          Orah DEX never holds your funds or stores your seed phrase. All trades settle directly on-chain.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* ── CREATE ── */}
                  {view === "create" && (
                    <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      className="p-6 space-y-5">

                      {createStep === "generate" && (
                        <>
                          {/* Network selector */}
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Network</p>
                            <div className="flex gap-2">
                              {(["bsv", "evm"] as WalletNetwork[]).map((n) => (
                                <button key={n}
                                  onClick={() => setCreateNetwork(n)}
                                  className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                                    createNetwork === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
                                  )}>
                                  {n === "bsv" ? "₿ Bitcoin SV" : "🌐 EVM / Web3"}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Word count */}
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Phrase Length</p>
                            <div className="flex gap-2">
                              {([12, 24] as const).map((n) => (
                                <button key={n}
                                  onClick={() => { setWordCount(n); setMnemonic(generateMnemonic(n)); setRevealed(false); setCopied(false); }}
                                  className={cn("flex-1 py-2 rounded-xl text-sm font-semibold border transition-all",
                                    wordCount === n ? "bg-primary/15 text-primary border-primary/50" : "border-border text-muted-foreground hover:border-primary/30"
                                  )}>
                                  {n} words
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Seed grid */}
                          <div className="relative">
                            <div className={cn("grid gap-2 p-4 bg-white/2 border border-border rounded-2xl",
                              wordCount === 12 ? "grid-cols-3" : "grid-cols-4")}>
                              {mnemonic.map((word, i) => (
                                <div key={i} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                                  <span className="text-[10px] text-muted-foreground font-mono w-4 shrink-0">{i + 1}.</span>
                                  <span className={cn("text-sm font-semibold text-foreground transition-all", !revealed && "blur-sm select-none")}>
                                    {word}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {!revealed && (
                              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-[2px]">
                                <button onClick={() => setRevealed(true)}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm shadow-lg">
                                  <Eye className="w-4 h-4" /> Reveal Seed Phrase
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Action row */}
                          <div className="flex gap-2">
                            <button onClick={regenerate}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 text-sm font-medium transition-all">
                              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                            </button>
                            <button onClick={handleCopy} disabled={!revealed}
                              className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all flex-1 justify-center",
                                revealed ? "border-primary/40 text-primary hover:bg-primary/10" : "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                              )}>
                              {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Phrase</>}
                            </button>
                          </div>

                          {/* Warning */}
                          <div className="flex items-start gap-3 p-4 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-300/80 leading-relaxed">
                              Write this phrase down and store it somewhere safe. <strong className="text-amber-300">Never share it with anyone.</strong>{" "}
                              Anyone with your seed phrase has full access to your funds.
                            </p>
                          </div>

                          {/* Confirm checkbox + continue */}
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                              className="mt-0.5 w-4 h-4 accent-primary cursor-pointer" />
                            <span className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                              I have written down my seed phrase and stored it safely. I understand it cannot be recovered.
                            </span>
                          </label>

                          <button
                            onClick={finishCreate}
                            disabled={!confirmed || !revealed}
                            className={cn("w-full py-3.5 rounded-xl font-bold text-sm transition-all",
                              confirmed && revealed
                                ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20"
                                : "bg-white/5 text-muted-foreground cursor-not-allowed"
                            )}>
                            Create Wallet
                          </button>
                        </>
                      )}

                      {createStep === "done" && (
                        <div className="py-10 flex flex-col items-center gap-4">
                          <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
                            <CheckCircle2 className="w-10 h-10 text-green-400" />
                          </div>
                          <h3 className="text-xl font-bold text-foreground">Wallet Created!</h3>
                          <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-xs">
                            Your new {createNetwork.toUpperCase()} wallet is ready. Keep your seed phrase safe.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── IMPORT ── */}
                  {view === "import" && (
                    <motion.div key="import" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      className="p-6 space-y-5">

                      {importStep === "enter" && (
                        <>
                          {/* Network selector */}
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Network</p>
                            <div className="flex gap-2">
                              {(["bsv", "evm"] as WalletNetwork[]).map((n) => (
                                <button key={n} onClick={() => setImportNetwork(n)}
                                  className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                                    importNetwork === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
                                  )}>
                                  {n === "bsv" ? "₿ Bitcoin SV" : "🌐 EVM / Web3"}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Seed Phrase</p>
                              <span className="text-xs text-muted-foreground">{importInput.trim().split(/\s+/).filter(Boolean).length} words</span>
                            </div>
                            <textarea
                              value={importInput}
                              onChange={(e) => { setImportInput(e.target.value); setImportError(null); }}
                              placeholder="Enter your 12 or 24-word seed phrase, separated by spaces..."
                              rows={5}
                              className={cn(
                                "w-full bg-white/3 border rounded-xl p-4 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none transition-all font-mono leading-relaxed",
                                importError ? "border-red-500/60 focus:border-red-500" : "border-border focus:border-primary/60"
                              )}
                            />
                            {importError && (
                              <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1.5">
                                <AlertTriangle className="w-3 h-3" /> {importError}
                              </p>
                            )}
                          </div>

                          {/* Quick word-count pills */}
                          <div className="flex gap-2">
                            {[12, 24].map((n) => (
                              <span key={n} className="px-2.5 py-1 bg-white/5 border border-border text-muted-foreground text-xs rounded-full">{n} words</span>
                            ))}
                            <span className="text-xs text-muted-foreground self-center">BIP39 compatible</span>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-300/80 leading-relaxed">
                              Never enter your seed phrase on untrusted sites. Orah DEX never stores or transmits your phrase — all derivation is local.
                            </p>
                          </div>

                          <button
                            onClick={handleImport}
                            disabled={importInput.trim().length === 0}
                            className={cn("w-full py-3.5 rounded-xl font-bold text-sm transition-all",
                              importInput.trim().length > 0
                                ? "bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-500/20"
                                : "bg-white/5 text-muted-foreground cursor-not-allowed"
                            )}>
                            Import Wallet
                          </button>
                        </>
                      )}

                      {importStep === "done" && (
                        <div className="py-10 flex flex-col items-center gap-4">
                          <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
                            <CheckCircle2 className="w-10 h-10 text-green-400" />
                          </div>
                          <h3 className="text-xl font-bold text-foreground">Wallet Imported!</h3>
                          <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-xs">
                            {importAddress.slice(0, 14)}...{importAddress.slice(-8)}
                          </p>
                          <span className="px-3 py-1.5 bg-violet-500/15 text-violet-400 text-xs font-semibold rounded-full uppercase">{importNetwork}</span>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── CONNECT ── */}
                  {view === "connect" && (
                    <motion.div key="connect" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>

                      {/* Error banner */}
                      {connectError && (
                        <div className="mx-6 mt-4 flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-300 leading-relaxed flex-1">{connectError}</p>
                          <button onClick={() => setConnectError(null)} className="text-red-400/60 hover:text-red-400 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Network Tabs */}
                      <div className="flex gap-2 px-6 pt-4">
                        {(["evm", "bsv"] as ConnectTab[]).map((t) => (
                          <button key={t} onClick={() => setConnectTab(t)}
                            className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                              connectTab === t
                                ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40 bg-transparent"
                            )}>
                            {t === "evm" ? "🌐 EVM / Web3" : "₿ Bitcoin SV"}
                          </button>
                        ))}
                      </div>
                      <div className="px-6 pt-3 pb-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Wifi className="w-3 h-3" />
                          {connectTab === "evm" ? "Ethereum Mainnet — all EVM-compatible chains supported" : "Bitcoin SV Mainnet — on-chain settlement via BSV script"}
                        </div>
                      </div>
                      <div className="px-6 pb-4">
                        {[wallets.filter(w => w.popular), wallets.filter(w => !w.popular)].map((group, gi) => (
                          group.length > 0 && (
                            <div key={gi} className="mb-3">
                              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                                {gi === 0 ? "Popular" : "More Wallets"}
                              </p>
                              <div className="grid gap-2">
                                {group.map((wallet) => (
                                  <WalletButton key={wallet.id} wallet={wallet} connecting={connecting} connected={connected} onConnect={handleConnectWallet} />
                                ))}
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                      <div className="px-6 pb-5">
                        <div className="flex items-start gap-3 p-4 bg-primary/5 text-primary rounded-xl border border-primary/10">
                          <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                          <p className="text-xs leading-relaxed">
                            <span className="font-semibold">Non-custodial & Trustless.</span>{" "}
                            Orah DEX never holds your funds. All trades settle directly on-chain — no registration, no KYC.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function WalletButton({ wallet, connecting, connected, onConnect }: {
  wallet: WalletDef; connecting: string | null; connected: string | null; onConnect: (w: WalletDef) => void;
}) {
  const isConnecting = connecting === wallet.id;
  const isConnected = connected === wallet.id;
  const isDisabled = !!connecting;
  const installed = wallet.network === "evm" ? isWalletInstalled(wallet.id) : false;
  const isMobile = isMobileDevice();

  const badge = (() => {
    if (wallet.network === "bsv") return null;
    if (wallet.id === "walletconnect") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-medium">QR / Mobile</span>;
    if (installed) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">Detected</span>;
    if (isMobile && wallet.id === "metamask") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">Open App</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-muted-foreground font-medium">Install</span>;
  })();

  return (
    <button onClick={() => onConnect(wallet)} disabled={isDisabled}
      className={cn("flex items-center justify-between w-full p-3.5 rounded-xl border transition-all duration-200 group",
        "border-border hover:border-primary/50 hover:bg-primary/5",
        isConnecting || isConnected ? "border-primary bg-primary/5 scale-[0.99]" : "",
        installed && !isConnecting && !isConnected ? "border-green-500/20" : "",
        isDisabled && !isConnecting && !isConnected ? "opacity-40 cursor-not-allowed" : ""
      )}>
      <div className="flex items-center gap-3">
        <span className="text-2xl w-8 text-center">{wallet.icon}</span>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{wallet.name}</span>
            {badge}
          </div>
          <div className="text-xs text-muted-foreground">{wallet.description}</div>
        </div>
      </div>
      <div className="shrink-0">
        {isConnected ? <CheckCircle2 className="w-5 h-5 text-green-500" />
          : isConnecting ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />}
      </div>
    </button>
  );
}
