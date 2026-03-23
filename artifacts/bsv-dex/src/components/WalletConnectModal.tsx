import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Shield, ChevronRight, Wifi, CheckCircle2,
  PlusCircle, Download, Link2, Copy, Check,
  Eye, EyeOff, AlertTriangle, RefreshCw, ArrowLeft,
  Layers, HardDrive, QrCode,
} from "lucide-react";
import { useWalletStore, type WalletNetwork } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";
import { generateMnemonic, deriveAddress, validateMnemonic } from "@/lib/seedPhrase";
import { openReownModal, isReownReady, subscribeReownAccount, fetchEvmBalance } from "@/lib/reown";

interface WalletDef {
  id: string; name: string; network: WalletNetwork;
  icon: string; description: string; popular?: boolean; chainId?: number;
}

const EVM_WALLETS: WalletDef[] = [
  { id: "metamask",    name: "MetaMask",       network: "evm", icon: "🦊", description: "Most popular Ethereum wallet — all EVM chains", popular: true, chainId: 1 },
  { id: "walletconnect", name: "Reown WalletConnect", network: "evm", icon: "🔗", description: "300+ wallets — MetaMask Mobile, Trust, Coinbase & more via QR code", popular: true, chainId: 1 },
  { id: "coinbase",   name: "Coinbase Wallet", network: "evm", icon: "🔵", description: "Self-custody by Coinbase — all EVM chains", popular: true, chainId: 1 },
  { id: "trust",      name: "Trust Wallet",    network: "evm", icon: "🛡️", description: "Multi-chain mobile — EVM + BSV + 100+ coins", chainId: 1 },
  { id: "imtoken",    name: "imToken",         network: "evm", icon: "🪙", description: "L1 / L2 / L3 multi-chain — ETH, BNB, MATIC, ARB…", chainId: 1 },
  { id: "guarda",     name: "Guarda Wallet",   network: "evm", icon: "🟢", description: "EVM + BSV + 400k+ assets supported", chainId: 1 },
  { id: "atomic",     name: "Atomic Wallet",   network: "evm", icon: "⚛️", description: "500+ coins — EVM all layers + BSV + more", chainId: 1 },
  { id: "okx",        name: "OKX Wallet",      network: "evm", icon: "⭕", description: "Web3 gateway by OKX — all EVM networks", chainId: 1 },
  { id: "bybit",      name: "Bybit Wallet",    network: "evm", icon: "🟡", description: "Web3 wallet by Bybit exchange", chainId: 1 },
  { id: "rainbow",    name: "Rainbow",         network: "evm", icon: "🌈", description: "Simple Ethereum wallet — L1 & L2", chainId: 1 },
  { id: "phantom",    name: "Phantom",         network: "evm", icon: "👻", description: "Multichain — ETH, SOL, BTC", chainId: 1 },
  { id: "ledger",     name: "Ledger",          network: "evm", icon: "🔒", description: "Hardware wallet — cold storage", chainId: 1 },
  { id: "trezor",     name: "Trezor",          network: "evm", icon: "🛡️", description: "Open-source hardware wallet", chainId: 1 },
];

const BSV_WALLETS: WalletDef[] = [
  { id: "handcash",  name: "HandCash",      network: "bsv", icon: "✋", description: "Social BSV wallet — simple & fast", popular: true },
  { id: "relayx",   name: "RelayX",        network: "bsv", icon: "⚡", description: "BSV DeFi wallet", popular: true },
  { id: "panda",    name: "Panda Wallet",  network: "bsv", icon: "🐼", description: "Browser extension for BSV", popular: true },
  { id: "guarda",   name: "Guarda Wallet", network: "bsv", icon: "🟢", description: "Supports BSV + EVM + 400k+ assets" },
  { id: "atomic",   name: "Atomic Wallet", network: "bsv", icon: "⚛️", description: "500+ coins including BSV + all EVM" },
  { id: "twetch",   name: "Twetch",        network: "bsv", icon: "🐦", description: "Social + wallet on BSV" },
  { id: "sensilet", name: "Sensilet",      network: "bsv", icon: "🔷", description: "sCrypt smart contract wallet" },
  { id: "yours",    name: "Yours Wallet",  network: "bsv", icon: "💛", description: "Open-source BSV wallet" },
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

  // When multiple extensions inject into window.ethereum.providers[]
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    if (walletId === "metamask") {
      return eth.providers.find((p: any) => p.isMetaMask)
        ?? eth.providers[0]; // fall back to first provider
    }
    if (walletId === "coinbase") return eth.providers.find((p: any) => p.isCoinbaseWallet) ?? null;
    if (walletId === "trust") return eth.providers.find((p: any) => p.isTrust) ?? null;
    return eth.providers[0];
  }

  // Single provider — use it for any EVM wallet, regardless of isMetaMask flag
  if (walletId === "coinbase" && !eth.isCoinbaseWallet) return null;
  if (walletId === "trust" && !eth.isTrust) return null;
  if (walletId === "okx") return (window as any).okxwallet ?? (eth.isOKExWallet ? eth : null);
  return eth; // MetaMask, Rainbow, Bybit, Ledger, any injected wallet
}

function isWalletInstalled(walletId: string): boolean {
  const eth = (window as any).ethereum;
  if (!eth) return false;
  switch (walletId) {
    case "metamask": return !!(eth.isMetaMask || eth.providers?.some((p: any) => p.isMetaMask) || eth);
    case "coinbase": return !!(eth.isCoinbaseWallet || eth.providers?.some((p: any) => p.isCoinbaseWallet));
    case "trust": return !!(eth.isTrust || eth.providers?.some((p: any) => p.isTrust));
    case "okx": return !!(window as any).okxwallet || !!eth.isOKExWallet;
    case "bybit": return !!eth.isBybit;
    case "phantom": return !!(window as any).phantom?.ethereum;
    default: return !!eth;
  }
}

const WALLET_INSTALL_URLS: Record<string, string> = {
  metamask:     "https://metamask.io/download/",
  coinbase:     "https://www.coinbase.com/wallet/downloads",
  rainbow:      "https://rainbow.me/",
  trust:        "https://trustwallet.com/download",
  okx:          "https://www.okx.com/web3",
  bybit:        "https://www.bybit.com/en/web3/",
  phantom:      "https://phantom.app/download",
  ledger:       "https://www.ledger.com/ledger-live",
  trezor:       "https://trezor.io/start",
  imtoken:      "https://token.im/download",
  guarda:       "https://guarda.com/desktop/",
  atomic:       "https://atomicwallet.io/downloads",
  walletconnect: null as any,
};

const EVM_LAYER_CHAINS = [
  { layer: 1, id: "eth",  name: "Ethereum",      chainId: 1,     symbol: "ETH",  badge: "L1", color: "blue" },
  { layer: 1, id: "bsc",  name: "BNB Chain",     chainId: 56,    symbol: "BNB",  badge: "L1", color: "yellow" },
  { layer: 2, id: "poly", name: "Polygon",        chainId: 137,   symbol: "MATIC",badge: "L2", color: "violet" },
  { layer: 2, id: "arb",  name: "Arbitrum One",   chainId: 42161, symbol: "ETH",  badge: "L2", color: "blue" },
  { layer: 2, id: "op",   name: "Optimism",       chainId: 10,    symbol: "ETH",  badge: "L2", color: "red" },
  { layer: 2, id: "base", name: "Base",           chainId: 8453,  symbol: "ETH",  badge: "L2", color: "blue" },
  { layer: 3, id: "zk",   name: "zkSync Era",     chainId: 324,   symbol: "ETH",  badge: "L3", color: "violet" },
  { layer: 3, id: "stark",name: "StarkNet",       chainId: 0,     symbol: "STRK", badge: "L3", color: "orange" },
];

function EvmChainSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const layerColors: Record<number, string> = { 1: "bg-blue-500/10 text-blue-400 border-blue-500/30", 2: "bg-violet-500/10 text-violet-400 border-violet-500/30", 3: "bg-orange-500/10 text-orange-400 border-orange-500/30" };
  const groups = [1, 2, 3];
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5" /> EVM Layer &amp; Chain
      </p>
      <div className="space-y-2">
        {groups.map(layer => (
          <div key={layer}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold mb-1.5 px-1">
              Layer {layer} {layer === 1 ? "— Base Chains" : layer === 2 ? "— Rollups & Sidechains" : "— App Chains"}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {EVM_LAYER_CHAINS.filter(c => c.layer === layer).map(c => (
                <button key={c.id} onClick={() => onChange(c.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left",
                    value === c.id
                      ? layerColors[layer]
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}>
                  <span className={cn("text-[9px] font-black px-1 py-0.5 rounded", layerColors[layer])}>{c.badge}</span>
                  <span className="truncate">{c.name}</span>
                  {c.chainId > 0 && <span className="ml-auto text-muted-foreground/50 text-[9px]">#{c.chainId}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountIndexSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">HD Account Index</p>
      <div className="flex gap-2 flex-wrap">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <button key={i} onClick={() => onChange(i)}
            className={cn(
              "w-10 h-9 rounded-lg border text-sm font-mono font-semibold transition-all",
              value === i ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
            )}>
            {i}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-1.5">
        Derivation path: m/44'/60'/{value}'/0/0 — each index is a separate account from the same seed
      </p>
    </div>
  );
}

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

  const [evmChain, setEvmChain] = useState("eth");
  const [accountIndex, setAccountIndex] = useState(0);
  const [trezorStatus, setTrezorStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [trezorError, setTrezorError] = useState<string | null>(null);
  const [reownStatus, setReownStatus] = useState<"idle" | "opening" | "waiting" | "done" | "error">("idle");
  const reownPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleClose = () => {
    // Clean up any active Reown timeout
    if (reownPollRef.current) {
      clearTimeout(reownPollRef.current);
      reownPollRef.current = null;
    }
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
      setReownStatus("idle");
      setConnecting(null);
      setConnected(null);
      setConnectError(null);
    }, 400);
  };

  const handleConnectWallet = async (wallet: WalletDef) => {
    setConnectError(null);

    // ── EVM wallets ──────────────────────────────────────────────────────────
    if (wallet.network === "evm") {

      if (wallet.id === "walletconnect") {
        setConnectError(null);
        setReownStatus("opening");
        setConnecting("walletconnect");

        if (!isReownReady()) {
          setConnectError(
            "WalletConnect is not configured yet. Go to Admin → Integrations and add your free Reown Project ID."
          );
          setReownStatus("error");
          setConnecting(null);
          return;
        }

        // Open the Reown AppKit modal (QR code + 300+ wallets)
        openReownModal("Connect");
        setReownStatus("waiting");

        // Subscribe to Reown's account state — fires when user connects in the modal
        let resolved = false;
        const unsub = subscribeReownAccount(async ({ address: addr, isConnected }) => {
          if (resolved) return;
          if (isConnected && addr) {
            resolved = true;
            unsub();
            if (reownPollRef.current) {
              clearTimeout(reownPollRef.current);
              reownPollRef.current = null;
            }

            // Fetch chainId and balance
            let chainId = 1;
            try {
              const eth = (window as any).ethereum;
              if (eth) {
                const hex: string = await eth.request({ method: "eth_chainId" });
                chainId = parseInt(hex, 16);
              }
            } catch { /* use default */ }

            const balance = await fetchEvmBalance(addr);
            connect({ address: addr, provider: "walletconnect", network: "evm", chainId, balance: balance ?? undefined });

            setReownStatus("done");
            setConnecting(null);
            setTimeout(() => { setReownStatus("idle"); handleClose(); }, 800);
          }
        });

        // Fallback timeout — unsubscribe after 90 seconds if nothing happens
        reownPollRef.current = setTimeout(() => {
          if (!resolved) {
            unsub();
            setReownStatus("idle");
            setConnecting(null);
          }
        }, 90_000) as any;

        return;
      }

      // Trezor hardware wallet — load TrezorConnect from CDN
      if (wallet.id === "trezor") {
        setConnecting("trezor");
        setTrezorStatus("connecting");
        setTrezorError(null);
        try {
          let TC = (window as any).TrezorConnect;
          if (!TC) {
            await new Promise<void>((resolve, reject) => {
              const s = document.createElement("script");
              s.src = "https://connect.trezor.io/9/trezor-connect.js";
              s.onload = () => resolve();
              s.onerror = () => reject(new Error("Failed to load TrezorConnect SDK"));
              document.head.appendChild(s);
            });
            TC = (window as any).TrezorConnect;
          }
          await TC.init({
            lazyLoad: true,
            manifest: { email: "admin@orahdex.com", appUrl: window.location.origin },
          });
          const path = `m/44'/60'/${accountIndex}'/0/0`;
          const result = await TC.ethereumGetAddress({ path, showOnTrezor: true });
          if (!result.success) throw new Error(result.payload?.error ?? "Trezor rejected the request");
          const addr = result.payload.address;
          const selectedChain = EVM_LAYER_CHAINS.find(c => c.id === evmChain);
          connect({ address: addr, provider: "trezor", network: "evm", chainId: selectedChain?.chainId ?? 1 });
          setTrezorStatus("idle");
          setConnecting(null);
          setConnected("trezor");
          setTimeout(() => { setConnected(null); handleClose(); }, 800);
        } catch (err: any) {
          setTrezorStatus("error");
          setTrezorError(err?.message ?? "Trezor connection failed. Make sure Trezor Suite is open.");
          setConnecting(null);
          setConnectError(err?.message ?? "Trezor connection failed. Open Trezor Suite and try again.");
        }
        return;
      }

      // Resolve provider — Phantom and OKX have their own namespaces
      let provider: any = null;
      if (wallet.id === "phantom") {
        provider = (window as any).phantom?.ethereum ?? null;
      } else if (wallet.id === "okx") {
        provider = (window as any).okxwallet ?? null;
      } else {
        provider = getEthereumProvider(wallet.id);
      }

      // No provider at all — redirect to install page or MetaMask mobile deep link
      if (!provider) {
        if (wallet.id === "metamask") {
          if (isMobileDevice()) {
            window.open(METAMASK_MOBILE_DEEPLINK, "_blank");
          } else {
            window.open("https://metamask.io/download/", "_blank");
          }
        } else {
          const url = WALLET_INSTALL_URLS[wallet.id];
          if (url) window.open(url, "_blank");
          else setConnectError(`${wallet.name} extension not detected. Install it and refresh.`);
        }
        return;
      }

      // Request accounts — triggers the real wallet popup
      setConnecting(wallet.id);
      try {
        const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
        if (!accounts?.length) throw new Error("Wallet returned no accounts.");

        const rawChain: string = await provider.request({ method: "eth_chainId" });
        const chainId = parseInt(rawChain, 16);

        // Fetch balance immediately after connecting
        const balance = await fetchEvmBalance(accounts[0]);
        connect({ address: accounts[0], provider: wallet.id, network: "evm", chainId, balance: balance ?? undefined });

        // Keep in sync when user switches account or chain inside MetaMask
        provider.removeAllListeners?.();
        provider.on?.("accountsChanged", async (accs: string[]) => {
          if (!accs.length) useWalletStore.getState().disconnect();
          else {
            const bal = await fetchEvmBalance(accs[0]);
            useWalletStore.getState().connect({ address: accs[0], provider: wallet.id, network: "evm", chainId, balance: bal ?? undefined });
          }
        });
        provider.on?.("chainChanged", async (hex: string) => {
          const newChainId = parseInt(hex, 16);
          const bal = await fetchEvmBalance(accounts[0]);
          useWalletStore.getState().connect({ address: accounts[0], provider: wallet.id, network: "evm", chainId: newChainId, balance: bal ?? undefined });
        });

        setConnecting(null);
        setConnected(wallet.id);
        setTimeout(() => { setConnected(null); handleClose(); }, 800);
      } catch (err: any) {
        setConnecting(null);
        const code = err?.code;
        if (code === 4001 || code === "ACTION_REJECTED") {
          setConnectError("Connection request rejected. Approve it in your wallet and try again.");
        } else if (code === -32002) {
          setConnectError("MetaMask is already waiting for approval — open your wallet extension and accept.");
        } else {
          setConnectError(err?.message ?? "Connection failed. Make sure your wallet is unlocked and try again.");
        }
      }
      return;
    }

    // ── BSV wallets (no browser standard yet — simulated) ───────────────────
    setConnecting(wallet.id);
    setTimeout(() => {
      setConnected(wallet.id);
      setTimeout(() => {
        connect({ address: generateMockAddress("bsv"), provider: wallet.id, network: "bsv" });
        setConnecting(null); setConnected(null);
        handleClose();
      }, 700);
    }, 1200);
  };

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
                    <p className="text-xs text-muted-foreground mt-0.5 italic">Trade means DEX ✦</p>
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
                              MetaMask, Guarda, imToken, Atomic, Trust, OKX, HandCash, RelayX and 15+ more. 1-click auto-detect.
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                        </div>
                        <div className="flex gap-2 mt-4">
                          {["🦊", "🟢", "🪙", "⚛️", "✋", "⚡"].map((e) => (
                            <span key={e} className="text-xl">{e}</span>
                          ))}
                          <span className="text-sm text-muted-foreground self-center">+15 more</span>
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

                          {/* EVM Layer/Chain selector */}
                          {createNetwork === "evm" && (
                            <>
                              <EvmChainSelector value={evmChain} onChange={setEvmChain} />
                              <AccountIndexSelector value={accountIndex} onChange={setAccountIndex} />
                            </>
                          )}

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

                          {/* EVM Layer/Chain selector for import */}
                          {importNetwork === "evm" && (
                            <>
                              <EvmChainSelector value={evmChain} onChange={setEvmChain} />
                              <AccountIndexSelector value={accountIndex} onChange={setAccountIndex} />
                              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 text-xs text-blue-300/80">
                                <Layers className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                                <span>Your EVM seed phrase works on <strong>all layers</strong> — Ethereum, Polygon, Arbitrum, Base etc. use the same keys. Select the chain you want to connect to on Orah DEX.</span>
                              </div>
                            </>
                          )}

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

                      {/* Reown / WalletConnect waiting banner */}
                      {(reownStatus === "waiting" || reownStatus === "opening") && (
                        <div className="mx-6 mt-4 flex items-center gap-3 p-3.5 bg-violet-500/10 border border-violet-500/30 rounded-xl">
                          <RefreshCw className="w-4 h-4 text-violet-400 shrink-0 animate-spin" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-violet-300">Reown modal open</p>
                            <p className="text-[11px] text-violet-300/70">Scan the QR code with your mobile wallet or select a wallet in the Reown popup.</p>
                          </div>
                          <button
                            onClick={() => {
                              if (reownPollRef.current) { clearInterval(reownPollRef.current); reownPollRef.current = null; }
                              setReownStatus("idle"); setConnecting(null);
                            }}
                            className="text-violet-400/60 hover:text-violet-400 shrink-0"
                          >
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
                          {connectTab === "evm"
                            ? <span>EVM-compatible — <span className="text-blue-400 font-medium">L1</span> Ethereum · BSC &nbsp;|&nbsp; <span className="text-violet-400 font-medium">L2</span> Polygon · Arbitrum · Base &nbsp;|&nbsp; <span className="text-orange-400 font-medium">L3</span> zkSync</span>
                            : "Bitcoin SV Mainnet — on-chain settlement via BSV script"}
                        </div>
                      </div>

                      {/* Trezor: account index selector shown inline */}
                      {connectTab === "evm" && (
                        <div className="px-6 pb-3">
                          <div className="p-3.5 rounded-xl border border-border bg-card/50 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              <HardDrive className="w-3.5 h-3.5" /> Hardware Wallet / Account Settings
                            </div>
                            <AccountIndexSelector value={accountIndex} onChange={setAccountIndex} />
                            <p className="text-[10px] text-muted-foreground/50">Used by Trezor and Ledger hardware wallets to derive the correct account address.</p>
                          </div>
                        </div>
                      )}

                      {/* 1-Click Auto-Detect */}
                      {connectTab === "evm" && (
                        <div className="px-6 pb-3">
                          <button
                            onClick={() => {
                              const autoWallet = EVM_WALLETS.find(w => isWalletInstalled(w.id));
                              if (autoWallet) handleConnectWallet(autoWallet);
                              else { setConnectError("No EVM wallet detected. Install MetaMask, imToken, Guarda, or any EVM wallet extension and try again."); }
                            }}
                            disabled={!!connecting}
                            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/25 disabled:opacity-50"
                          >
                            <Wifi className="w-4 h-4" />
                            1-Click Auto-Detect &amp; Connect
                          </button>
                          <p className="text-[10px] text-muted-foreground/60 text-center mt-1.5">
                            Automatically finds and connects your installed wallet — MetaMask, Guarda, imToken, OKX, and more
                          </p>
                        </div>
                      )}

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
