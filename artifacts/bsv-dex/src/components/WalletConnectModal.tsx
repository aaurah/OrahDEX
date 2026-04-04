import { useState, useEffect, useRef } from "react";
import { OrahInline } from "@/components/BrandLogo";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Shield, ChevronRight, CheckCircle2,
  PlusCircle, Download, Link2, Copy, Check,
  Eye, AlertTriangle, RefreshCw, ArrowLeft,
  Layers, Key, Fingerprint, Loader2, Trash2,
  Smartphone, Wifi, QrCode, FlaskConical,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useWalletStore, type WalletNetwork } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { cn } from "@/lib/utils";
import { generateMnemonic, deriveAllAddresses, validateMnemonic, type HdWalletAddresses } from "@/lib/seedPhrase";
import { privateKeyToAccount } from "viem/accounts";
import {
  isPasskeySupported,
  registerPasskeyWallet,
  loginWithPasskey,
  listPasskeyWallets,
  generateTransferCode,
} from "@/lib/passkeyWallet";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { ReownConnectPanel } from "@/components/ReownConnectButton";
import { fetchBsvBalance } from "@/hooks/useBsvBalance";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { getChainName } from "@/lib/chainConfig";

/* ── Wallet definitions ───────────────────────────────────────────────────── */
interface WalletDef {
  id: string; name: string; icon: string; description: string;
  popular?: boolean; installUrl?: string;
}

const EVM_WALLETS: WalletDef[] = [
  { id: "metamask",  name: "MetaMask",       icon: "🦊", description: "Most popular Ethereum wallet — all EVM chains",         popular: true,  installUrl: "https://metamask.io/download/" },
  { id: "coinbase",  name: "Coinbase Wallet", icon: "🔵", description: "Self-custody by Coinbase — all EVM chains",             popular: true,  installUrl: "https://www.coinbase.com/wallet/downloads" },
  { id: "trust",     name: "Trust Wallet",    icon: "🛡️", description: "Multi-chain mobile — EVM + BSV + 100+ coins",          popular: true,  installUrl: "https://trustwallet.com/download" },
  { id: "okx",       name: "OKX Wallet",      icon: "⭕", description: "Web3 gateway by OKX — all EVM networks",               popular: false, installUrl: "https://www.okx.com/web3" },
  { id: "bybit",     name: "Bybit Wallet",    icon: "🟡", description: "Web3 wallet by Bybit exchange",                         popular: false },
  { id: "rainbow",   name: "Rainbow",         icon: "🌈", description: "Simple Ethereum wallet — L1 & L2",                     popular: false, installUrl: "https://rainbow.me/" },
  { id: "phantom",   name: "Phantom",         icon: "👻", description: "Multichain — ETH, SOL, BTC",                           popular: false, installUrl: "https://phantom.app/download" },
  { id: "imtoken",   name: "imToken",         icon: "🪙", description: "L1 / L2 / L3 multi-chain — ETH, BNB, MATIC, ARB…",   popular: false, installUrl: "https://token.im/download" },
  { id: "guarda",    name: "Guarda Wallet",   icon: "🟢", description: "EVM + BSV + 400k+ assets supported",                   popular: false, installUrl: "https://guarda.com/desktop/" },
  { id: "atomic",    name: "Atomic Wallet",   icon: "⚛️", description: "500+ coins — EVM all layers + BSV + more",             popular: false, installUrl: "https://atomicwallet.io/downloads" },
  { id: "ledger",    name: "Ledger",          icon: "🔒", description: "Hardware wallet — cold storage",                        popular: false, installUrl: "https://www.ledger.com/ledger-live" },
];

const BSV_WALLETS: WalletDef[] = [
  { id: "handcash",  name: "HandCash",     icon: "✋", description: "Social BSV wallet — simple & fast",        popular: true },
  { id: "relayx",   name: "RelayX",       icon: "⚡", description: "BSV DeFi wallet",                           popular: true },
  { id: "panda",    name: "Panda Wallet", icon: "🐼", description: "Browser extension for BSV",                 popular: true },
  { id: "guarda",   name: "Guarda Wallet",icon: "🟢", description: "BSV + EVM + 400k+ assets",                  popular: false },
  { id: "atomic",   name: "Atomic Wallet",icon: "⚛️", description: "500+ coins including BSV",                  popular: false },
  { id: "twetch",   name: "Twetch",       icon: "🐦", description: "Social + wallet on BSV",                    popular: false },
  { id: "sensilet", name: "Sensilet",     icon: "🔷", description: "sCrypt smart contract wallet",              popular: false },
  { id: "yours",    name: "Yours Wallet", icon: "💛", description: "Open-source BSV wallet",                    popular: false },
];

const SOL_WALLETS: WalletDef[] = [
  { id: "phantom-sol",  name: "Phantom",   icon: "👻", description: "Most popular Solana wallet",               popular: true,  installUrl: "https://phantom.app/download" },
  { id: "solflare",     name: "Solflare",  icon: "🌟", description: "Official Solana Foundation wallet",        popular: true,  installUrl: "https://solflare.com/download" },
  { id: "backpack",     name: "Backpack",  icon: "🎒", description: "xNFT browser wallet for Solana",           popular: false, installUrl: "https://www.backpack.app/downloads" },
  { id: "glow",         name: "Glow",      icon: "🟣", description: "Fast Solana wallet for power users",       popular: false, installUrl: "https://glow.app" },
  { id: "slope",        name: "Slope",     icon: "🔶", description: "Mobile-first Solana wallet",               popular: false, installUrl: "https://slope.finance" },
];

const BTC_WALLETS: WalletDef[] = [
  { id: "phantom-btc", name: "Phantom",    icon: "👻", description: "Bitcoin + Solana + Ethereum — no Lightning",  popular: true,  installUrl: "https://phantom.app/download" },
  { id: "unisat",      name: "UniSat",     icon: "🟠", description: "Bitcoin & Ordinals wallet — on-chain only",   popular: true,  installUrl: "https://unisat.io/download" },
  { id: "xverse",      name: "Xverse",     icon: "🔑", description: "Bitcoin-first — Ordinals, BRC-20, on-chain", popular: true,  installUrl: "https://www.xverse.app/download" },
  { id: "leather",     name: "Leather",    icon: "🟤", description: "Bitcoin wallet for Stacks & BTC",             popular: false, installUrl: "https://leather.io/install-extension" },
  { id: "oyl",         name: "OYL Wallet", icon: "🛢️", description: "Bitcoin Ordinals & Runes wallet",             popular: false, installUrl: "https://oyl.io" },
];

const TRON_WALLETS: WalletDef[] = [
  { id: "tronlink",    name: "TronLink",      icon: "🔴", description: "Official TRON browser extension — TRX, TRC-20, DApps", popular: true,  installUrl: "https://www.tronlink.org/" },
  { id: "imtoken",     name: "imToken",       icon: "🔷", description: "imToken supports TRON — TRX, USDT-TRC20, BTT & all TRC-20", popular: true, installUrl: "https://token.im/download" },
  { id: "trust-tron",  name: "Trust Wallet",  icon: "🛡️", description: "Multi-chain mobile — TRX, USDT-TRC20, BTT & more",     popular: true,  installUrl: "https://trustwallet.com/download" },
  { id: "tokenpocket", name: "TokenPocket",   icon: "🟣", description: "Multi-chain DeFi wallet with full TRON support",        popular: false, installUrl: "https://www.tokenpocket.pro/en/download/app" },
  { id: "okx-tron",    name: "OKX Wallet",    icon: "⭕", description: "Web3 gateway by OKX — TRON + EVM + 70+ chains",         popular: false, installUrl: "https://www.okx.com/web3" },
  { id: "bitget-tron", name: "Bitget Wallet", icon: "🔵", description: "Multi-chain DeFi wallet — TRX & TRC-20 native",         popular: false, installUrl: "https://web3.bitget.com/en/wallet-download" },
];

/* ── EVM chain list (all major chains) ───────────────────────────────────── */
const EVM_LAYER_CHAINS = [
  /* L1 — Base Chains */
  { layer: 1, id: "eth",   name: "Ethereum",     chainId: 1,       symbol: "ETH",   badge: "L1", icon: "⟠" },
  { layer: 1, id: "bsc",   name: "BNB Chain",    chainId: 56,      symbol: "BNB",   badge: "L1", icon: "🟡" },
  { layer: 1, id: "avax",  name: "Avalanche",    chainId: 43114,   symbol: "AVAX",  badge: "L1", icon: "🔺" },
  { layer: 1, id: "ftm",   name: "Fantom",       chainId: 250,     symbol: "FTM",   badge: "L1", icon: "👻" },
  { layer: 1, id: "cro",   name: "Cronos",       chainId: 25,      symbol: "CRO",   badge: "L1", icon: "🔵" },
  /* L2 — Rollups & Sidechains */
  { layer: 2, id: "poly",  name: "Polygon",      chainId: 137,     symbol: "MATIC", badge: "L2", icon: "🟣" },
  { layer: 2, id: "arb",   name: "Arbitrum One", chainId: 42161,   symbol: "ETH",   badge: "L2", icon: "🔷" },
  { layer: 2, id: "op",    name: "Optimism",     chainId: 10,      symbol: "ETH",   badge: "L2", icon: "🔴" },
  { layer: 2, id: "base",  name: "Base",         chainId: 8453,    symbol: "ETH",   badge: "L2", icon: "🔵" },
  { layer: 2, id: "linea", name: "Linea",        chainId: 59144,   symbol: "ETH",   badge: "L2", icon: "⬛" },
  /* L3 — App Chains */
  { layer: 3, id: "zk",    name: "zkSync Era",   chainId: 324,     symbol: "ETH",   badge: "L3", icon: "⚡" },
  { layer: 3, id: "scroll",name: "Scroll",       chainId: 534352,  symbol: "ETH",   badge: "L3", icon: "📜" },
  { layer: 3, id: "mantle",name: "Mantle",       chainId: 5000,    symbol: "MNT",   badge: "L3", icon: "🟢" },
];

/* TRON (TVM — not EVM but commonly listed) */
const TRON_INFO = { id: "tron", name: "TRON", symbol: "TRX", chainId: "mainnet", icon: "🔴", badge: "TVM" };

const LAYER_COLORS: Record<number, string> = {
  1: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  2: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  3: "bg-orange-500/10 text-orange-400 border-orange-500/30",
};

function EvmChainSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5" /> EVM Layer &amp; Chain
      </p>
      <div className="space-y-2">
        {[1, 2, 3].map(layer => (
          <div key={layer}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold mb-1.5 px-1">
              Layer {layer} {layer === 1 ? "— Base Chains" : layer === 2 ? "— Rollups & Sidechains" : "— App Chains"}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {EVM_LAYER_CHAINS.filter(c => c.layer === layer).map(c => (
                <button key={c.id} onClick={() => onChange(c.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left",
                    value === c.id ? LAYER_COLORS[layer] : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}>
                  <span className={cn("text-[9px] font-black px-1 py-0.5 rounded", LAYER_COLORS[layer])}>{c.badge}</span>
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-muted-foreground/50 text-[9px]">#{c.chainId}</span>
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


/* ── EVM provider resolution ─────────────────────────────────────────────── */
function getEvmProvider(walletId: string): any {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    if (walletId === "metamask") return eth.providers.find((p: any) => p.isMetaMask) ?? eth.providers[0];
    if (walletId === "coinbase") return eth.providers.find((p: any) => p.isCoinbaseWallet) ?? null;
    if (walletId === "trust") return eth.providers.find((p: any) => p.isTrust) ?? null;
    return eth.providers[0];
  }
  if (walletId === "coinbase" && !eth.isCoinbaseWallet) return null;
  if (walletId === "trust" && !eth.isTrust) return null;
  if (walletId === "okx") return (window as any).okxwallet ?? (eth.isOKExWallet ? eth : null);
  if (walletId === "phantom") return (window as any).phantom?.ethereum ?? null;
  return eth;
}

type View = "landing" | "create" | "import" | "connect" | "prep" | "passkey" | "mobileqr";
type ConnectTab = "reown" | "bsv" | "tron";
type CreateStep = "generate" | "done";
type ImportStep = "enter" | "done";

const CONNECT_TABS: { id: ConnectTab; label: string; emoji: string }[] = [
  { id: "reown", label: "EVM Wallets", emoji: "🔗" },
  { id: "tron",  label: "TRON",        emoji: "🔴" },
  { id: "bsv",   label: "Bitcoin SV",  emoji: "⚡" },
];

export function WalletConnectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const connect = useWalletStore((s) => s.connect);
  const connectDemo = useWalletStore((s) => s.connectDemo);
  const setBalance = useWalletStore((s) => s.setBalance);
  const setInternalEvmAddress = useWalletStore((s) => s.setInternalEvmAddress);
  const setInternalBsvAddress = useWalletStore((s) => s.setInternalBsvAddress);
  const setInternalBchAddress = useWalletStore((s) => s.setInternalBchAddress);
  const setInternalBtcAddress = useWalletStore((s) => s.setInternalBtcAddress);
  const setInternalSolAddress = useWalletStore((s) => s.setInternalSolAddress);
  const walletState = useWalletStore();
  const initialTab = useWalletModalStore((s) => s.initialTab);

  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"real" | "demo">("real");

  // Sync mainTab with initialTab whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setMainTab(initialTab);
      setView("landing");
    }
  }, [isOpen, initialTab]);

  const handleDemoAccount = async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      // Use a stable demo address stored in localStorage so sessions persist
      let demoAddr = localStorage.getItem("orahdex_demo_address");
      if (!demoAddr) {
        const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
        demoAddr = `DEMO_${uuid}`;
        localStorage.setItem("orahdex_demo_address", demoAddr);
      }
      const res = await fetch(`${API_BASE}/demo/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: demoAddr }),
      });
      if (!res.ok) throw new Error("Demo activation failed");
      connectDemo(demoAddr);
      onClose();
    } catch (e: any) {
      setDemoError(e?.message ?? "Could not start demo — try again");
    } finally {
      setDemoLoading(false);
    }
  };

  const [view, setView] = useState<View>("landing");
  const [connectTab, setConnectTab] = useState<ConnectTab>("bsv");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  /* prep (post-connection wallet setup) state */
  const [prepAddr, setPrepAddr] = useState("");
  const [prepNetwork, setPrepNetwork] = useState<WalletNetwork>("bsv");
  const [prepProvider, setPrepProvider] = useState("");
  const [prepStep, setPrepStep] = useState<"fund" | "approve" | "done">("fund");

  /* Live EVM token balances shown in the connected-wallet prep screen */
  const { balances: prepEvmBalances, loading: prepBalLoading, refresh: refreshPrepBal } = useEvmBalances(
    prepNetwork === "evm" ? prepAddr || null : null,
    prepNetwork === "evm" ? (walletState.chainId ?? 1) : null
  );

  /* create wallet state */
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [createStep, setCreateStep] = useState<CreateStep>("generate");
  const [createNetwork, setCreateNetwork] = useState<WalletNetwork>("evm");
  const [isHdWallet, setIsHdWallet] = useState(true);
  const [hdAddresses, setHdAddresses] = useState<HdWalletAddresses | null>(null);
  const [hdDeriving, setHdDeriving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  /* import wallet state */
  const [importInput, setImportInput] = useState("");
  const [importNetwork, setImportNetwork] = useState<WalletNetwork>("evm");
  const [importStep, setImportStep] = useState<ImportStep>("enter");
  const [importError, setImportError] = useState<string | null>(null);
  const [importAddress, setImportAddress] = useState("");
  const [importMode, setImportMode] = useState<"seed" | "privatekey">("seed");
  const [importPrivKey, setImportPrivKey] = useState("");

  /* evm extras */
  const [evmChain, setEvmChain] = useState("eth");
  const [accountIndex, setAccountIndex] = useState(0);

  /* bsv sub-step state */
  type BsvStep = "list" | "handcash" | "relayx" | "panda" | "sensilet" | "manual";
  const [bsvStep, setBsvStep] = useState<BsvStep>("list");
  const [bsvHandle, setBsvHandle] = useState("");
  const [bsvHandleState, setBsvHandleState] = useState<"idle"|"loading"|"found"|"error">("idle");
  const [bsvHandleErr, setBsvHandleErr] = useState("");
  const [bsvResolvedAddr, setBsvResolvedAddr] = useState("");
  const [bsvHandleFallback, setBsvHandleFallback] = useState(false);
  const [bsvDisplayName, setBsvDisplayName] = useState("");
  const [bsvAvatarUrl, setBsvAvatarUrl] = useState<string | null>(null);
  const [bsvManualAddr, setBsvManualAddr] = useState("");
  const [bsvManualWallet, setBsvManualWallet] = useState("");

  /* passkey state */
  const [passkeyStep, setPasskeyStep] = useState<"idle"|"registering"|"logging_in"|"done"|"error">("idle");
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyResult, setPasskeyResult] = useState<{ address: string; label: string; chains?: { evm: string; sol?: string; btc?: string; bch?: string; bsv?: string } } | null>(null);
  const [passkeyLabel, setPasskeyLabel] = useState("My OrahDEX Wallet");
  const [passkeySupported] = useState(() => isPasskeySupported());
  const [storedPasskeys, setStoredPasskeys] = useState(() => listPasskeyWallets());
  const [restoredFromBackup, setRestoredFromBackup] = useState(false);
  const [transferCodeInput, setTransferCodeInput] = useState("");
  const [transferCodeLoading, setTransferCodeLoading] = useState(false);
  const [transferCodeError, setTransferCodeError] = useState<string | null>(null);
  const [showTransferCodeInput, setShowTransferCodeInput] = useState(false);
  /* Per-wallet QR code generation */
  const [qrWalletId, setQrWalletId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  /* Mobile QR session pairing */
  const [mqrToken,   setMqrToken]   = useState<string | null>(null);
  const [mqrExpires, setMqrExpires] = useState<number>(0);
  const [mqrStatus,  setMqrStatus]  = useState<"pending" | "connected" | "expired" | "error">("pending");
  const [mqrAddress, setMqrAddress] = useState<string | null>(null);
  const mqrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopMqrPoll = () => { if (mqrPollRef.current) { clearInterval(mqrPollRef.current); mqrPollRef.current = null; } };

  const startMobileQRSession = async () => {
    stopMqrPoll();
    setMqrToken(null);
    setMqrStatus("pending");
    setMqrAddress(null);
    try {
      const res = await fetch(`${API_BASE}/connect-session`, { method: "POST" });
      const data = await res.json() as { token: string; expiresAt: number };
      setMqrToken(data.token);
      setMqrExpires(data.expiresAt);
      // Poll every 2 seconds
      mqrPollRef.current = setInterval(async () => {
        if (Date.now() > data.expiresAt) { setMqrStatus("expired"); stopMqrPoll(); return; }
        try {
          const poll = await fetch(`${API_BASE}/connect-session/${data.token}`);
          if (!poll.ok) { stopMqrPoll(); return; }
          const pollData = await poll.json() as { status: string; address?: string; chain?: string; walletType?: string };
          if (pollData.status === "connected" && pollData.address) {
            setMqrStatus("connected");
            setMqrAddress(pollData.address);
            stopMqrPoll();
            connect({ address: pollData.address, provider: pollData.walletType ?? "mobile-qr", network: (pollData.chain?.toLowerCase() === "bsv" ? "bsv" : "evm") as WalletNetwork });
            setTimeout(() => goToPrep(pollData.address!, (pollData.chain?.toLowerCase() === "bsv" ? "bsv" : "evm") as WalletNetwork, "mobile-qr"), 1500);
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch {
      setMqrStatus("error");
    }
  };

  const handlePasskeyRegister = async () => {
    setPasskeyStep("registering");
    setPasskeyError(null);
    try {
      const result = await registerPasskeyWallet(passkeyLabel || "My OrahDEX Wallet");
      setPasskeyResult({ address: result.address, label: result.label, chains: result.chains });
      setStoredPasskeys(listPasskeyWallets());
      setPasskeyStep("done");
      connect({ address: result.address, provider: "aura-wallet", network: "evm" });
      setInternalEvmAddress(result.address);
      if (result.chains?.bsv) setInternalBsvAddress(result.chains.bsv);
      if (result.chains?.bch) setInternalBchAddress(result.chains.bch);
      if (result.chains?.btc) setInternalBtcAddress(result.chains.btc);
      if (result.chains?.sol) setInternalSolAddress(result.chains.sol);
      setTimeout(() => goToPrep(result.address, "evm", "passkey"), 1200);
    } catch (e: any) {
      setPasskeyError(e?.message ?? "Passkey creation failed");
      setPasskeyStep("error");
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyStep("logging_in");
    setPasskeyError(null);
    setRestoredFromBackup(false);
    try {
      const result = await loginWithPasskey();
      setPasskeyResult({ address: result.address, label: result.label, chains: result.chains });
      setRestoredFromBackup(result.restoredFromBackup ?? false);
      setStoredPasskeys(listPasskeyWallets());
      setPasskeyStep("done");
      connect({ address: result.address, provider: "aura-wallet", network: "evm" });
      setInternalEvmAddress(result.address);
      if (result.chains?.bsv) setInternalBsvAddress(result.chains.bsv);
      if (result.chains?.bch) setInternalBchAddress(result.chains.bch);
      if (result.chains?.btc) setInternalBtcAddress(result.chains.btc);
      if (result.chains?.sol) setInternalSolAddress(result.chains.sol);
      setTimeout(() => goToPrep(result.address, "evm", "passkey"), result.restoredFromBackup ? 2000 : 1200);
    } catch (e: any) {
      const msg: string = e?.message ?? "Passkey authentication failed";
      setPasskeyError(msg);
      setPasskeyStep("error");
    }
  };

  const handleGenerateQr = async (credentialId: string) => {
    if (qrWalletId === credentialId) {
      setQrWalletId(null);
      setQrCode(null);
      return;
    }
    setQrLoading(true);
    setQrError(null);
    setQrCode(null);
    setQrWalletId(credentialId);
    try {
      const code = await generateTransferCode(credentialId);
      setQrCode(code);
    } catch (err: any) {
      setQrError(err?.message ?? "Failed to generate code");
    } finally {
      setQrLoading(false);
    }
  };

  // When isOpen goes from true → false externally (e.g. Markets closes it on navigation),
  // reset all internal state so the next open starts fresh.
  const prevOpenRef = useRef(isOpen);
  useEffect(() => {
    if (prevOpenRef.current && !isOpen) {
      // Slight delay to let exit animation run first
      const t = setTimeout(() => {
        setView("landing");
        setCreateStep("generate");
        setImportStep("enter");
        setMnemonic([]);
        setRevealed(false);
        setCopied(false);
        setConfirmed(false);
        setImportInput("");
        setImportError(null);
        setImportMode("seed");
        setImportPrivKey("");
        setConnecting(null);
        setConnected(null);
        setConnectError(null);
        setBsvStep("list");
        setBsvHandle("");
        setBsvHandleState("idle");
        setBsvHandleErr("");
        setBsvResolvedAddr("");
        setBsvHandleFallback(false);
        setBsvDisplayName("");
        setBsvAvatarUrl(null);
        setBsvManualAddr("");
        setPrepAddr("");
        setPrepNetwork("bsv");
        setPrepProvider("");
        setPrepStep("fund");
      }, 350);
      return () => clearTimeout(t);
    }
    prevOpenRef.current = isOpen;
    return undefined;
  }, [isOpen]);

  const handleClose = () => {
    stopMqrPoll();
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
      setImportMode("seed");
      setImportPrivKey("");
      setConnecting(null);
      setConnected(null);
      setConnectError(null);
      setBsvStep("list");
      setBsvHandle("");
      setBsvHandleState("idle");
      setBsvHandleErr("");
      setBsvResolvedAddr("");
      setBsvHandleFallback(false);
      setBsvDisplayName("");
      setBsvAvatarUrl(null);
      setBsvManualAddr("");
      setPrepAddr("");
      setPrepNetwork("bsv");
      setPrepProvider("");
      setPrepStep("fund");
    }, 400);
  };

  /* ── Go to prep view after successful connection ─────────────────────── */
  const goToPrep = (addr: string, network: WalletNetwork, provider: string) => {
    setPrepAddr(addr);
    setPrepNetwork(network);
    setPrepProvider(provider);
    setPrepStep("fund");
    setConnected(null);
    setView("prep");
  };

  /* ── SOL connection ─────────────────────────────────────────────────────── */
  const handleConnectSol = async (walletId: string) => {
    setConnectError(null);
    let provider: any = null;

    if (walletId === "phantom-sol") {
      provider = (window as any).phantom?.solana ?? (window as any).solana ?? null;
    } else if (walletId === "solflare") {
      provider = (window as any).solflare ?? null;
    } else if (walletId === "backpack") {
      provider = (window as any).backpack ?? null;
    } else if (walletId === "glow") {
      provider = (window as any).glow?.solana ?? null;
    } else if (walletId === "slope") {
      provider = (window as any).Slope ? new (window as any).Slope() : null;
    }

    if (!provider) {
      const w = SOL_WALLETS.find(x => x.id === walletId);
      if (w?.installUrl) window.open(w.installUrl, "_blank");
      setConnectError(`${w?.name ?? "Wallet"} not detected. Install the extension then try again.`);
      return;
    }

    setConnecting(walletId);
    try {
      const resp = await provider.connect();
      const address: string = resp?.publicKey?.toString() ?? provider.publicKey?.toString();
      if (!address) throw new Error("No public key returned from wallet.");

      // Fetch real SOL balance — try wallet provider first, then fall back to public RPC
      let solBalance: string | undefined;
      try {
        const lamports: number | null = await provider.getBalance?.(resp?.publicKey ?? provider.publicKey) ?? null;
        if (lamports !== null && lamports !== undefined) {
          solBalance = (lamports / 1e9).toFixed(6);
        } else {
          // Fallback: public Solana mainnet RPC
          const rpcRes = await fetch("https://api.mainnet-beta.solana.com", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
          });
          if (rpcRes.ok) {
            const rpcData = await rpcRes.json();
            const lamps = rpcData?.result?.value;
            if (lamps !== undefined) solBalance = (lamps / 1e9).toFixed(6);
          }
        }
      } catch { /* non-critical */ }

      connect({ address, provider: walletId, network: "sol", balance: solBalance });
      setConnected(walletId);
      setTimeout(() => goToPrep(address, "sol", walletId), 800);
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.includes("rejected") || msg.includes("cancelled")) {
        setConnectError("Connection cancelled. Approve the request in your wallet.");
      } else {
        setConnectError(msg || "Connection failed. Make sure your wallet is unlocked.");
      }
    } finally {
      setConnecting(null);
    }
  };

  /* ── BTC connection (no Lightning) ─────────────────────────────────────── */
  const handleConnectBtc = async (walletId: string) => {
    setConnectError(null);

    if (walletId === "phantom-btc") {
      const btcProvider = (window as any).phantom?.bitcoin;
      if (!btcProvider) {
        window.open("https://phantom.app/download", "_blank");
        setConnectError("Phantom not detected. Install it and try again.");
        return;
      }
      setConnecting(walletId);
      try {
        const accounts: { address: string; addressType: string }[] = await btcProvider.requestAccounts();
        /* prefer native-segwit (p2wpkh) → taproot (p2tr) → anything else — never lightning */
        const addr =
          accounts.find(a => a.addressType === "p2wpkh")?.address ??
          accounts.find(a => a.addressType === "p2tr")?.address ??
          accounts.find(a => a.addressType !== "p2sh")?.address ??
          accounts[0]?.address;
        if (!addr) throw new Error("No on-chain Bitcoin address returned.");
        connect({ address: addr, provider: "phantom-btc", network: "btc" });
        setConnected(walletId);
        setTimeout(() => goToPrep(addr, "btc", "phantom-btc"), 800);
      } catch (err: any) {
        setConnectError(err?.message ?? "Phantom BTC connection failed.");
      } finally {
        setConnecting(null);
      }
      return;
    }

    if (walletId === "unisat") {
      const unisat = (window as any).unisat;
      if (!unisat) {
        window.open("https://unisat.io/download", "_blank");
        setConnectError("UniSat not detected. Install it and try again.");
        return;
      }
      setConnecting(walletId);
      try {
        const accounts: string[] = await unisat.requestAccounts();
        if (!accounts?.length) throw new Error("No accounts returned.");
        connect({ address: accounts[0], provider: "unisat", network: "btc" });
        setConnected(walletId);
        setTimeout(() => goToPrep(accounts[0], "btc", "unisat"), 800);
      } catch (err: any) {
        setConnectError(err?.message ?? "UniSat connection failed.");
      } finally {
        setConnecting(null);
      }
      return;
    }

    if (walletId === "xverse") {
      const xverse = (window as any).XverseProviders?.BitcoinProvider ?? (window as any).BitcoinProvider;
      if (!xverse) {
        window.open("https://www.xverse.app/download", "_blank");
        setConnectError("Xverse not detected. Install it and try again.");
        return;
      }
      setConnecting(walletId);
      try {
        /* Xverse injects getAccounts or request method */
        let addr = "";
        if (typeof xverse.request === "function") {
          const res = await xverse.request("getAccounts", { purposes: ["payment", "ordinals"] });
          addr = res?.result?.[0]?.address ?? res?.result?.payment?.address ?? "";
        } else if (typeof xverse.getAccounts === "function") {
          const accs = await xverse.getAccounts();
          addr = accs?.[0]?.address ?? "";
        }
        if (!addr) throw new Error("No address returned from Xverse.");
        connect({ address: addr, provider: "xverse", network: "btc" });
        setConnected(walletId);
        setTimeout(() => goToPrep(addr, "btc", "xverse"), 800);
      } catch (err: any) {
        setConnectError(err?.message ?? "Xverse connection failed.");
      } finally {
        setConnecting(null);
      }
      return;
    }

    if (walletId === "leather") {
      const leather = (window as any).LeatherProvider ?? (window as any).HiroWalletProvider;
      if (!leather) {
        window.open("https://leather.io/install-extension", "_blank");
        setConnectError("Leather wallet not detected. Install it and try again.");
        return;
      }
      setConnecting(walletId);
      try {
        const res = await leather.request("getAddresses");
        const addrs: { symbol: string; address: string }[] = res?.result?.addresses ?? [];
        const btcAddr = addrs.find(a => a.symbol === "BTC")?.address ?? addrs[0]?.address;
        if (!btcAddr) throw new Error("No BTC address returned from Leather.");
        connect({ address: btcAddr, provider: "leather", network: "btc" });
        setConnected(walletId);
        setTimeout(() => goToPrep(btcAddr, "btc", "leather"), 800);
      } catch (err: any) {
        setConnectError(err?.message ?? "Leather connection failed.");
      } finally {
        setConnecting(null);
      }
      return;
    }

    /* Generic fallback */
    const w = BTC_WALLETS.find(x => x.id === walletId);
    if (w?.installUrl) window.open(w.installUrl, "_blank");
    setConnectError(`${w?.name ?? "Wallet"} not detected. Install it and try again.`);
  };

  /* ── EVM connection ─────────────────────────────────────────────────────── */
  const handleConnectEvm = async (walletId: string, installUrl?: string) => {
    setConnectError(null);
    let provider: any = getEvmProvider(walletId);

    if (!provider) {
      if (installUrl) window.open(installUrl, "_blank");
      setConnectError(`${walletId === "metamask" ? "MetaMask" : "Wallet"} not detected. Install the extension and try again.`);
      return;
    }

    setConnecting(walletId);
    try {
      const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
      if (!accounts?.length) throw new Error("Wallet returned no accounts.");
      const rawChain: string = await provider.request({ method: "eth_chainId" });
      const chainId = parseInt(rawChain, 16);

      // Fetch real native token balance from the wallet
      let nativeBalance: string | undefined;
      try {
        const rawBal: string = await provider.request({ method: "eth_getBalance", params: [accounts[0], "latest"] });
        const balWei = BigInt(rawBal);
        const balEth = Number(balWei) / 1e18;
        nativeBalance = balEth.toFixed(6);
      } catch { /* non-critical */ }

      connect({ address: accounts[0], provider: walletId, network: "evm", chainId, balance: nativeBalance });

      provider.removeAllListeners?.();
      provider.on?.("accountsChanged", (accs: string[]) => {
        if (!accs.length) useWalletStore.getState().disconnect();
        else useWalletStore.getState().connect({ address: accs[0], provider: walletId, network: "evm", chainId });
      });
      provider.on?.("chainChanged", (hex: string) => {
        useWalletStore.getState().connect({ address: accounts[0], provider: walletId, network: "evm", chainId: parseInt(hex, 16) });
      });

      setConnected(walletId);
      setTimeout(() => goToPrep(accounts[0], "evm", walletId), 800);
    } catch (err: any) {
      const code = err?.code;
      if (code === 4001 || code === "ACTION_REJECTED") setConnectError("Connection rejected. Approve it in your wallet.");
      else if (code === -32002) setConnectError("Wallet is waiting for approval — open it and accept.");
      else setConnectError(err?.message ?? "Connection failed. Make sure your wallet is unlocked.");
    } finally {
      setConnecting(null);
    }
  };

  /* ── BSV connection ─────────────────────────────────────────────────────── */
  const handleConnectBsv = async (walletId: string) => {
    setConnectError(null);

    /* HandCash — needs $handle input + API lookup */
    if (walletId === "handcash") {
      setBsvHandle("");
      setBsvHandleState("idle");
      setBsvHandleErr("");
      setBsvResolvedAddr("");
      setBsvStep("handcash");
      return;
    }

    /* RelayX — check window.relayone extension */
    if (walletId === "relayx") {
      const relay = (window as any).relayone;
      if (relay) {
        setConnecting("relayx");
        try {
          const res = await relay.authWithOpts({ reason: "OrahDEX sign-in" });
          const addr: string = res?.paymail ?? res?.address ?? "";
          if (!addr) throw new Error("RelayX returned no address. Try signing in to RelayX first.");
          connect({ address: addr, provider: "relayx", network: "bsv" });
          setConnected("relayx");
          setTimeout(() => goToPrep(addr, "bsv", "relayx"), 700);
        } catch (err: any) {
          if (err?.message?.includes("user rejected") || err?.code === 4001) {
            setConnectError("Connection cancelled in RelayX.");
          } else {
            setConnectError(err?.message ?? "RelayX connection failed.");
          }
        } finally {
          setConnecting(null);
        }
      } else {
        setBsvManualWallet("RelayX");
        setBsvManualAddr("");
        setBsvStep("relayx");
      }
      return;
    }

    /* Panda Wallet — check window.panda extension */
    if (walletId === "panda") {
      const panda = (window as any).panda;
      if (panda) {
        setConnecting("panda");
        try {
          const res = await panda.connect();
          const addr: string = res?.address ?? res?.bsvAddress ?? res?.paymail ?? "";
          if (!addr) throw new Error("Panda Wallet returned no address. Make sure it is unlocked.");
          connect({ address: addr, provider: "panda", network: "bsv" });
          setConnected("panda");
          setTimeout(() => goToPrep(addr, "bsv", "panda"), 700);
        } catch (err: any) {
          setConnectError(err?.message ?? "Panda Wallet connection failed.");
        } finally {
          setConnecting(null);
        }
      } else {
        setBsvManualWallet("Panda Wallet");
        setBsvManualAddr("");
        setBsvStep("panda");
      }
      return;
    }

    /* Sensilet — check window.sensilet extension */
    if (walletId === "sensilet") {
      const sensilet = (window as any).sensilet;
      if (sensilet) {
        setConnecting("sensilet");
        try {
          const accs: string[] = await sensilet.requestAccount();
          const addr = Array.isArray(accs) ? accs[0] : (accs as any)?.address ?? "";
          if (!addr) throw new Error("Sensilet returned no address.");
          connect({ address: addr, provider: "sensilet", network: "bsv" });
          setConnected("sensilet");
          setTimeout(() => goToPrep(addr, "bsv", "sensilet"), 700);
        } catch (err: any) {
          setConnectError(err?.message ?? "Sensilet connection failed.");
        } finally {
          setConnecting(null);
        }
      } else {
        setBsvManualWallet("Sensilet");
        setBsvManualAddr("");
        setBsvStep("sensilet");
      }
      return;
    }

    /* Twetch — check window.twetch */
    if (walletId === "twetch") {
      const twetch = (window as any).twetch;
      if (twetch) {
        setConnecting("twetch");
        try {
          const res = await twetch.requestAccount?.();
          const addr: string = res?.address ?? "";
          if (!addr) throw new Error("Twetch returned no address.");
          connect({ address: addr, provider: "twetch", network: "bsv" });
          setConnected("twetch");
          setTimeout(() => goToPrep(addr, "bsv", "twetch"), 700);
        } catch (err: any) {
          setConnectError(err?.message ?? "Twetch connection failed.");
        } finally {
          setConnecting(null);
        }
      } else {
        setBsvManualWallet("Twetch");
        setBsvManualAddr("");
        setBsvStep("manual");
      }
      return;
    }

    /* Yours Wallet — check window.yours */
    if (walletId === "yours") {
      const yours = (window as any).yours;
      if (yours) {
        setConnecting("yours");
        try {
          const res = await yours.connect?.();
          const addr: string = res?.address ?? yours.address ?? "";
          if (!addr) throw new Error("Yours Wallet returned no address.");
          connect({ address: addr, provider: "yours", network: "bsv" });
          setConnected("yours");
          setTimeout(() => goToPrep(addr, "bsv", "yours"), 700);
        } catch (err: any) {
          setConnectError(err?.message ?? "Yours Wallet connection failed.");
        } finally {
          setConnecting(null);
        }
      } else {
        setBsvManualWallet("Yours Wallet");
        setBsvManualAddr("");
        setBsvStep("manual");
      }
      return;
    }

    /* Guarda, Atomic — no browser extension; show manual address entry */
    const w = BSV_WALLETS.find(x => x.id === walletId);
    setBsvManualWallet(w?.name ?? walletId);
    setBsvManualAddr("");
    setBsvStep("manual");
  };

  /* ── HandCash handle lookup (via API server proxy to avoid CORS) ─────── */
  const lookupHandCash = async () => {
    const handle = bsvHandle.trim().replace(/^\$/, "").toLowerCase();
    if (!handle) return;
    if (!/^[a-z0-9_.-]{1,50}$/i.test(handle)) {
      setBsvHandleState("error");
      setBsvHandleErr("Invalid handle — use only letters, numbers, underscores and dots.");
      return;
    }
    setBsvHandleState("loading");
    setBsvHandleErr("");
    setBsvResolvedAddr("");
    setBsvHandleFallback(false);
    setBsvDisplayName("");
    setBsvAvatarUrl(null);
    try {
      const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${BASE_URL}/api/bsv/resolve-handle/${encodeURIComponent(handle)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err?.error ?? `Resolution failed (HTTP ${res.status}).`);
      }
      const data = await res.json() as {
        handle: string; address: string; paymail: string;
        displayName?: string; avatarUrl?: string | null;
        resolved: boolean; fallback?: boolean;
      };
      setBsvResolvedAddr(data.address);
      setBsvHandleFallback(data.fallback ?? false);
      setBsvDisplayName(data.displayName ?? `$${handle}`);
      setBsvAvatarUrl(data.avatarUrl ?? null);
      setBsvHandleState("found");
    } catch (err: any) {
      setBsvHandleState("error");
      setBsvHandleErr(err?.message ?? "Could not resolve handle. Check spelling or enter your paymail directly.");
    }
  };

  /* ── Confirm BSV manual address ───────────────────────────────────────── */
  const confirmBsvManual = (walletId: string) => {
    const addr = bsvManualAddr.trim();
    if (!addr) return;
    connect({ address: addr, provider: walletId, network: "bsv" });
    goToPrep(addr, "bsv", walletId);
  };

  /* ── TRON connection ────────────────────────────────────────────────────── */
  const handleConnectTron = async (walletId: string) => {
    setConnectError(null);

    /* Wallets that inject window.tronWeb (TronLink extension, imToken in-app browser) */
    const tronWebWallets = ["tronlink", "imtoken"];
    if (tronWebWallets.includes(walletId)) {
      const tronWeb = (window as any).tronWeb;
      const w = TRON_WALLETS.find(x => x.id === walletId)!;
      if (!tronWeb || !tronWeb.ready) {
        window.open(w.installUrl, "_blank");
        setConnectError(`${w.name} not detected. Open this page inside ${w.name} or install the app first.`);
        return;
      }
      setConnecting(walletId);
      try {
        const address: string = tronWeb.defaultAddress?.base58 ?? "";
        if (!address) throw new Error(`No TRON address found. Make sure ${w.name} is unlocked and connected.`);
        const sunBalance = await tronWeb.trx.getBalance(address);
        const trxBalance = (Number(sunBalance) / 1e6).toFixed(4);
        connect({ address, provider: walletId, network: "tron", balance: trxBalance });
        setConnected(walletId);
        setTimeout(() => goToPrep(address, "tron", walletId), 800);
      } catch (err: any) {
        setConnectError(err?.message ?? `${w.name} connection failed. Make sure it is unlocked.`);
      } finally {
        setConnecting(null);
      }
      return;
    }

    /* Generic fallback for mobile wallets / others: open install link */
    const w = TRON_WALLETS.find(x => x.id === walletId);
    if (w?.installUrl) window.open(w.installUrl, "_blank");
    setConnectError(`${w?.name ?? "Wallet"} not detected. Open this page inside the ${w?.name ?? "wallet"} app to connect.`);
  };

  const handleConnect = (walletId: string, _installUrl?: string) => {
    if (connectTab === "tron") return handleConnectTron(walletId);
    return handleConnectBsv(walletId);
  };

  /* ── Create wallet ────────────────────────────────────────────────────────── */
  const startCreate = (network: WalletNetwork, hdMode = true) => {
    setCreateNetwork(network);
    setIsHdWallet(hdMode);
    setHdAddresses(null);
    setMnemonic(generateMnemonic(wordCount));
    setCreateStep("generate");
    setRevealed(false);
    setCopied(false);
    setConfirmed(false);
    setView("create");
  };

  const regenerate = () => { setMnemonic(generateMnemonic(wordCount)); setCopied(false); setRevealed(false); setConfirmed(false); setHdAddresses(null); };

  const handleCopy = () => {
    navigator.clipboard?.writeText(mnemonic.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const finishCreate = async () => {
    setHdDeriving(true);
    try {
      const addrs = await deriveAllAddresses(mnemonic);
      setHdAddresses(addrs);
      connect({ address: addrs.evm, provider: "aura-wallet", network: "evm" });
      setInternalEvmAddress(addrs.evm);
      setInternalBsvAddress(addrs.bsv);
      setInternalBchAddress(addrs.bch);
      setInternalBtcAddress(addrs.btc);
      setInternalSolAddress(addrs.sol);
      setCreateStep("done");
      setTimeout(() => goToPrep(addrs.evm, "evm", "aura-wallet"), 2500);
    } finally {
      setHdDeriving(false);
    }
  };

  /* ── Import wallet — seed phrase ──────────────────────────────────────────── */
  const handleImport = async () => {
    const result = validateMnemonic(importInput);
    if (!result.valid) { setImportError(result.error ?? "Invalid phrase"); return; }
    setImportError(null);
    setHdDeriving(true);
    try {
      const addrs = await deriveAllAddresses(result.words);
      setHdAddresses(addrs);
      setImportAddress(addrs.evm);
      connect({ address: addrs.evm, provider: "aura-wallet", network: "evm" });
      setInternalEvmAddress(addrs.evm);
      setInternalBsvAddress(addrs.bsv);
      setInternalBchAddress(addrs.bch);
      setInternalBtcAddress(addrs.btc);
      setInternalSolAddress(addrs.sol);
      setImportStep("done");
      setTimeout(() => goToPrep(addrs.evm, "evm", "aura-wallet"), 2500);
    } finally {
      setHdDeriving(false);
    }
  };

  /* ── Import wallet — EVM private key ─────────────────────────────────────── */
  const handleImportPrivateKey = () => {
    const raw = importPrivKey.trim();
    const pk = raw.startsWith("0x") ? raw : `0x${raw}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
      setImportError("Invalid private key — must be 64 hex characters (with or without 0x prefix)");
      return;
    }
    setImportError(null);
    let addr: string;
    try {
      addr = privateKeyToAccount(pk as `0x${string}`).address;
    } catch {
      setImportError("Invalid private key — could not derive address");
      return;
    }
    setImportAddress(addr);
    connect({ address: addr, provider: "aura-wallet", network: "evm" });
    setImportStep("done");
    setTimeout(() => goToPrep(addr, "evm", "aura-wallet"), 1500);
  };

  const currentWallets = connectTab === "tron" ? TRON_WALLETS : BSV_WALLETS;

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
                  {view !== "landing" && view !== "prep" && (
                    <button onClick={() => setView("landing")}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5 transition-colors">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      {view === "landing" && <span className="flex items-center gap-2">Connect to <OrahInline className="text-xl" /></span>}
                      {view === "create" && "Create New Wallet"}
                      {view === "import" && "Import Wallet"}
                      {view === "connect" && "Connect Wallet"}
                      {view === "prep" && "Wallet Setup"}
                      {view === "passkey" && <span className="flex items-center gap-2"><Fingerprint className="w-5 h-5 text-primary" /> Passkey Wallet</span>}
                      {view === "mobileqr" && <span className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-white/70" /> Mobile QR Connect</span>}
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
                    <motion.div key="landing" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>

                      {/* ── Top-level account type tabs ── */}
                      <div className="px-5 pt-4 pb-3 border-b border-border">
                        <div className="flex bg-secondary/60 rounded-xl p-1 gap-1">
                          <button
                            onClick={() => setMainTab("real")}
                            className={cn(
                              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                              mainTab === "real"
                                ? "bg-card text-foreground shadow-sm border border-border"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <Shield className="w-4 h-4" />
                            Real Account
                          </button>
                          <button
                            onClick={() => setMainTab("demo")}
                            className={cn(
                              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                              mainTab === "demo"
                                ? "bg-yellow-500/20 text-yellow-300 shadow-sm border border-yellow-500/30"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <FlaskConical className="w-4 h-4" />
                            Demo Account
                          </button>
                        </div>
                      </div>

                      {/* ── REAL ACCOUNT panel ── */}
                      {mainTab === "real" && (
                      <div className="p-5 space-y-3">

                      {/* ⓪ Passkey — frictionless, no seed phrase */}
                      <div className={cn(
                        "rounded-2xl border p-4 bg-gradient-to-br",
                        passkeySupported
                          ? "border-primary/40 from-primary/10 via-primary/5 to-transparent"
                          : "border-border/40 from-white/3 to-transparent opacity-60"
                      )}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                            <Fingerprint className="w-6 h-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-[15px] text-foreground leading-tight">Passkey Login</h3>
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 tracking-wider uppercase">New</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground font-medium">
                              {passkeySupported
                                ? "EVM · SOL · BTC · BCH · BSV — biometrics, no seed phrase"
                                : "Not supported in this browser"}
                            </p>
                          </div>
                        </div>
                        {passkeySupported && (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => { setStoredPasskeys(listPasskeyWallets()); setPasskeyStep("idle"); setPasskeyError(null); setView("passkey"); handlePasskeyLogin(); }}
                              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20"
                            >
                              <Fingerprint className="w-4 h-4" />
                              Sign In
                            </button>
                            <button
                              onClick={() => { setStoredPasskeys(listPasskeyWallets()); setPasskeyStep("idle"); setPasskeyError(null); setView("passkey"); }}
                              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-primary/40 text-primary font-bold text-sm hover:bg-primary/10 transition-colors"
                            >
                              <PlusCircle className="w-4 h-4" />
                              Create New
                            </button>
                          </div>
                        )}
                        {passkeySupported && (
                          <div className="mt-3 space-y-2">
                            <div className="flex flex-wrap gap-1">
                              {["🔵 ETH/EVM", "🟣 Solana", "🟠 Bitcoin", "🟢 BCH", "⚡ BSV"].map(c => (
                                <span key={c} className="text-[9px] font-semibold px-1.5 py-0.5 bg-primary/10 text-primary/80 border border-primary/15 rounded">{c}</span>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground/60">
                              BIP39 HD wallet secured by biometrics — no seed phrase to write down
                            </p>
                          </div>
                        )}
                        {passkeySupported && storedPasskeys.length > 0 && (
                          <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-400" />
                            {storedPasskeys.length} passkey wallet{storedPasskeys.length > 1 ? "s" : ""} on this device
                          </div>
                        )}
                      </div>

                      {/* ① OrahDEX Native Wallet — all-chains HD wallet */}
                      <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                            <Layers className="w-6 h-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-[15px] text-foreground leading-tight">OrahDEX Wallet</h3>
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 tracking-wider uppercase">All Chains</span>
                            </div>
                            <p className="text-[11px] text-primary/80 font-semibold">EVM · SOL · BTC · BCH · BSV — one seed phrase</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <button
                            onClick={() => startCreate("evm")}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20"
                          >
                            <PlusCircle className="w-4 h-4" />
                            Create New
                          </button>
                          <button
                            onClick={() => { setImportMode("seed"); setImportError(null); setView("import"); }}
                            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-primary/40 text-primary font-bold text-sm hover:bg-primary/10 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            Import Phrase
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {["🔵 ETH/EVM", "🟣 Solana", "🟠 Bitcoin", "🟢 BCH", "⚡ BSV"].map(c => (
                            <span key={c} className="text-[9px] font-semibold px-1.5 py-0.5 bg-primary/10 text-primary/80 border border-primary/15 rounded">{c}</span>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 mt-2">
                          BIP39 · non-custodial · compatible with MetaMask, Phantom, Trust Wallet &amp; Ledger
                        </p>
                      </div>

                      {/* ② EVM — external wallet option */}
                      <div className="rounded-2xl border border-blue-500/35 bg-gradient-to-br from-blue-500/8 via-transparent to-transparent p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl shrink-0">🔵</div>
                          <div>
                            <h3 className="font-black text-[15px] text-foreground leading-tight">EVM Wallet</h3>
                            <p className="text-[11px] text-blue-300/80 font-semibold">MetaMask · Coinbase · Trust · all EVM chains</p>
                          </div>
                        </div>
                        {/* Three actions: Create / Import / Connect */}
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <button
                            onClick={() => startCreate("evm")}
                            className="flex flex-col items-center gap-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                          >
                            <PlusCircle className="w-4 h-4" />
                            Create New
                          </button>
                          <button
                            onClick={() => { setImportNetwork("evm"); setImportMode("seed"); setView("import"); }}
                            className="flex flex-col items-center gap-1 py-3 rounded-xl border border-blue-500/40 text-blue-300 font-bold text-xs hover:bg-blue-500/10 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            Import
                          </button>
                          <button
                            onClick={() => { setConnectTab("reown"); setView("connect"); }}
                            className="flex flex-col items-center gap-1 py-3 rounded-xl border border-border text-muted-foreground font-bold text-xs hover:border-blue-500/30 hover:text-foreground transition-all"
                          >
                            <Link2 className="w-4 h-4" />
                            Connect
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {["🔵 Ethereum","🟡 BNB Chain","🟣 Polygon","🔷 Arbitrum","🔴 Optimism","🔵 Base"].map(c => (
                            <span key={c} className="text-[9px] font-semibold px-1.5 py-0.5 bg-blue-500/10 text-blue-300/80 border border-blue-500/15 rounded">{c}</span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {["🦊 MetaMask","🔵 Coinbase","🛡️ Trust","⭕ OKX","🌈 Rainbow","🔒 Ledger"].map(w => (
                            <span key={w} className="text-[9px] font-semibold px-1.5 py-0.5 bg-white/5 text-muted-foreground border border-white/8 rounded">{w}</span>
                          ))}
                        </div>
                      </div>

                      {/* ② BSV — settlement layer */}
                      <div className="rounded-2xl border border-green-500/35 bg-gradient-to-br from-green-500/8 via-transparent to-transparent p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-green-500/20 flex items-center justify-center text-xl shrink-0">⚡</div>
                          <div>
                            <h3 className="font-black text-[15px] text-foreground leading-tight">Bitcoin SV Wallet</h3>
                            <p className="text-[11px] text-green-400 font-semibold">Settlement layer · sub-cent fees · instant finality</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <button
                            onClick={() => startCreate("bsv")}
                            className="flex flex-col items-center gap-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 active:scale-95 transition-all"
                          >
                            <PlusCircle className="w-4 h-4" />
                            Create New
                          </button>
                          <button
                            onClick={() => { setImportNetwork("bsv"); setImportMode("seed"); setView("import"); }}
                            className="flex flex-col items-center gap-1 py-3 rounded-xl border border-green-500/40 text-green-300 font-bold text-xs hover:bg-green-500/10 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            Import
                          </button>
                          <button
                            onClick={() => { setConnectTab("bsv"); setView("connect"); }}
                            className="flex flex-col items-center gap-1 py-3 rounded-xl border border-border text-muted-foreground font-bold text-xs hover:border-green-500/30 hover:text-foreground transition-all"
                          >
                            <Link2 className="w-4 h-4" />
                            Connect
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {["⚡ Bitcoin SV","🔗 Metanet","📜 OP_RETURN scripts","⛓ UTXO-native"].map(c => (
                            <span key={c} className="text-[9px] font-semibold px-1.5 py-0.5 bg-green-500/10 text-green-300/80 border border-green-500/15 rounded">{c}</span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {["✋ HandCash","⚡ RelayX","🐼 Panda","🔷 Sensilet","💛 Yours"].map(w => (
                            <span key={w} className="text-[9px] font-semibold px-1.5 py-0.5 bg-white/5 text-muted-foreground border border-white/8 rounded">{w}</span>
                          ))}
                        </div>
                      </div>

                      {/* ④ Connect via Mobile QR */}
                      <button
                        onClick={() => { setView("mobileqr"); startMobileQRSession(); }}
                        className="w-full rounded-2xl border border-white/12 bg-white/3 hover:bg-white/6 hover:border-white/20 p-4 text-left transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center shrink-0 group-hover:bg-white/12 transition-colors">
                            <Smartphone className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground leading-tight">Connect via Mobile QR</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Scan with your phone to link instantly</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
                        </div>
                      </button>

                      <div className="flex items-start gap-3 p-3 bg-primary/5 text-primary rounded-xl border border-primary/15">
                        <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                        <p className="text-xs leading-relaxed">
                          <span className="font-semibold">Non-custodial.</span>{" "}
                          OrahDEX never holds your keys. Trades settle on-chain via BSV — the fastest settlement layer.
                        </p>
                      </div>

                      </div>
                      )}

                      {/* ── DEMO ACCOUNT panel ── */}
                      {mainTab === "demo" && (
                        <div className="p-5 flex flex-col gap-4">

                          {/* Hero card */}
                          <div className="rounded-2xl border border-yellow-500/40 bg-gradient-to-br from-yellow-500/12 via-yellow-500/5 to-transparent p-5">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-14 h-14 rounded-2xl bg-yellow-500/20 flex items-center justify-center shrink-0">
                                <FlaskConical className="w-7 h-7 text-yellow-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <h3 className="font-black text-lg text-foreground leading-tight">Demo Account</h3>
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 tracking-wider uppercase">Free</span>
                                </div>
                                <p className="text-[12px] text-yellow-400/80 font-medium leading-snug">
                                  Practice trading with virtual funds — no real money at risk
                                </p>
                              </div>
                            </div>

                            {/* Asset breakdown */}
                            <div className="mb-4">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Virtual Funds Included</p>
                              <div className="grid grid-cols-3 gap-2">
                                {[
                                  { icon: "💵", label: "USDT", amount: "50,000" },
                                  { icon: "₿", label: "BTC", amount: "0.1" },
                                  { icon: "Ξ", label: "ETH", amount: "7" },
                                  { icon: "🔶", label: "BNB", amount: "8" },
                                  { icon: "⚡", label: "BSV", amount: "500" },
                                  { icon: "◎", label: "SOL", amount: "50" },
                                ].map(asset => (
                                  <div key={asset.label} className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2.5 border border-white/8">
                                    <span className="text-base shrink-0">{asset.icon}</span>
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-black text-foreground">{asset.amount}</p>
                                      <p className="text-[9px] text-muted-foreground font-semibold">{asset.label}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2.5 flex items-center justify-between px-1">
                                <span className="text-[11px] text-muted-foreground">Total virtual value</span>
                                <span className="text-[13px] font-black text-yellow-400">≈ $80,000</span>
                              </div>
                            </div>

                            {/* Existing demo address notice */}
                            {localStorage.getItem("orahdex_demo_address") && (
                              <div className="mb-3 flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 animate-pulse" />
                                <p className="text-[10px] text-yellow-300/80 font-medium flex-1 min-w-0">
                                  Existing demo session found — your virtual balance will be restored
                                </p>
                              </div>
                            )}

                            {/* CTA Button */}
                            <button
                              onClick={handleDemoAccount}
                              disabled={demoLoading}
                              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-black text-sm shadow-lg shadow-yellow-500/25 active:scale-95 transition-all disabled:opacity-60"
                            >
                              {demoLoading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up your demo…</>
                                : <><FlaskConical className="w-4 h-4" /> Connect Demo Account — Continue</>
                              }
                            </button>
                            {demoError && (
                              <p className="text-[11px] text-red-400 text-center mt-2">{demoError}</p>
                            )}
                          </div>

                          {/* What you can practice */}
                          <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">What you can practice</p>
                            {[
                              { emoji: "📈", title: "Spot Trading", desc: "Buy & sell crypto pairs with market and limit orders" },
                              { emoji: "⚡", title: "Futures Trading", desc: "Trade with leverage — up to 100× on major pairs" },
                              { emoji: "📊", title: "Portfolio Tracking", desc: "Monitor your virtual P&L and asset allocation" },
                              { emoji: "💧", title: "Liquidity Providing", desc: "Earn virtual fees by providing liquidity to pools" },
                            ].map(item => (
                              <div key={item.title} className="flex items-start gap-3">
                                <span className="text-base shrink-0 mt-0.5">{item.emoji}</span>
                                <div>
                                  <p className="text-[12px] font-bold text-foreground">{item.title}</p>
                                  <p className="text-[11px] text-muted-foreground leading-snug">{item.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Disclaimer */}
                          <div className="flex items-start gap-2.5 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-300/80 leading-relaxed">
                              Demo accounts use virtual funds only. No real crypto is deposited or at risk. Switch to a real account anytime.
                            </p>
                          </div>

                        </div>
                      )}

                    </motion.div>
                  )}

                  {/* ── CREATE ── */}
                  {view === "create" && (
                    <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      className="p-6 space-y-5">

                      {createStep === "generate" && (
                        <>
                          {/* All-chains banner */}
                          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-primary/10 via-blue-500/5 to-emerald-500/5 border border-primary/25">
                            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                              <Layers className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-foreground leading-tight">OrahDEX All-Chain Wallet</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">One phrase → EVM · SOL · BTC · BCH · BSV</p>
                            </div>
                            <Check className="w-4 h-4 text-primary ml-auto shrink-0" />
                          </div>

                          {/* Word count */}
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Phrase Length</p>
                            <div className="flex gap-2">
                              {([12, 24] as const).map(n => (
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

                          <div className="flex items-start gap-3 p-4 bg-green-500/8 border border-green-500/20 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-green-300/80 leading-relaxed">
                              Write this phrase down and store it somewhere safe. <strong className="text-green-300">Never share it.</strong> Anyone with your seed phrase has full access to your funds.
                            </p>
                          </div>

                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                              className="mt-0.5 w-4 h-4 accent-primary cursor-pointer" />
                            <span className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                              I have written down my seed phrase and stored it safely. I understand it cannot be recovered.
                            </span>
                          </label>

                          <button onClick={finishCreate} disabled={!confirmed || !revealed || hdDeriving}
                            className={cn("w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                              confirmed && revealed && !hdDeriving
                                ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20"
                                : "bg-white/5 text-muted-foreground cursor-not-allowed"
                            )}>
                            {hdDeriving ? <><Loader2 className="w-4 h-4 animate-spin" /> Deriving Addresses…</> : "Create Wallet"}
                          </button>
                        </>
                      )}

                      {createStep === "done" && hdAddresses && (
                        <div className="py-6 flex flex-col items-center gap-4">
                          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                            <CheckCircle2 className="w-8 h-8 text-green-400" />
                          </div>
                          <div className="text-center">
                            <h3 className="text-xl font-bold">Wallet Created!</h3>
                            <p className="text-xs text-muted-foreground mt-1">Tap a chain to connect with that address</p>
                          </div>
                          <div className="w-full space-y-2">
                            {[
                              { label: "EVM", sub: "ETH · BSC · Polygon · Arbitrum…", addr: hdAddresses.evm, color: "blue",    net: "evm" as WalletNetwork },
                              { label: "SOL", sub: "Solana · Phantom-compatible",      addr: hdAddresses.sol, color: "violet",  net: "sol" as WalletNetwork },
                              { label: "BTC", sub: "Bitcoin · m/44'/0'/0'/0/0",        addr: hdAddresses.btc, color: "orange",  net: "btc" as WalletNetwork },
                              { label: "BCH", sub: "Bitcoin Cash · CashAddr",          addr: hdAddresses.bch, color: "green",   net: null },
                              { label: "BSV", sub: "Bitcoin SV · m/44'/236'/0'/0/0",   addr: hdAddresses.bsv, color: "emerald", net: "bsv" as WalletNetwork },
                            ].map(({ label, sub, addr, color, net }) => {
                              const isActive = walletState.network === net && net !== null;
                              const inner = (
                                <>
                                  <span className={`text-xs font-black text-${color}-400 w-8 shrink-0`}>{label}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-muted-foreground">{sub}</p>
                                    <p className="text-xs font-mono text-foreground truncate">{addr}</p>
                                  </div>
                                  {net && !isActive && <span className="text-[9px] text-muted-foreground/50 shrink-0">Tap to use</span>}
                                  {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                                </>
                              );
                              return net ? (
                                <button
                                  key={label}
                                  onClick={() => { walletState.switchNetworkType(net); onClose(); }}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                                    ${isActive ? `bg-${color}-500/15 border-${color}-500/40` : `bg-${color}-500/8 border-${color}-500/20 hover:bg-${color}-500/15 hover:border-${color}-500/40`}`}
                                >
                                  {inner}
                                </button>
                              ) : (
                                <div key={label} className={`flex items-center gap-3 p-3 rounded-xl bg-${color}-500/8 border border-${color}-500/20 opacity-50`}>
                                  {inner}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── IMPORT ── */}
                  {view === "import" && (
                    <motion.div key="import" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      className="p-6 space-y-4">

                      {importStep === "enter" && (
                        <>
                          {/* All-chains banner + method selector */}
                          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-primary/10 via-blue-500/5 to-emerald-500/5 border border-primary/25">
                            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                              <Layers className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-foreground leading-tight">OrahDEX All-Chain Wallet</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Derives EVM · SOL · BTC · BCH · BSV from one phrase</p>
                            </div>
                          </div>

                          {/* Import method */}
                          <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-border">
                            <button
                              onClick={() => { setImportMode("seed"); setImportError(null); }}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
                                importMode === "seed"
                                  ? "bg-primary text-primary-foreground shadow"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Download className="w-3.5 h-3.5" /> Seed Phrase
                            </button>
                            <button
                              onClick={() => { setImportMode("privatekey"); setImportError(null); }}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
                                importMode === "privatekey"
                                  ? "bg-blue-600 text-white shadow"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Key className="w-3.5 h-3.5" /> EVM Private Key
                            </button>
                          </div>

                          {/* Private key input (EVM only) */}
                          {importMode === "privatekey" ? (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Private Key</p>
                                <span className="text-[10px] text-muted-foreground/60">64 hex chars</span>
                              </div>
                              <input
                                type="password"
                                value={importPrivKey}
                                onChange={e => { setImportPrivKey(e.target.value); setImportError(null); }}
                                placeholder="0x... or raw 64-character hex key"
                                className={cn(
                                  "w-full bg-white/3 border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none transition-all font-mono",
                                  importError ? "border-red-500/60 focus:border-red-500" : "border-border focus:border-blue-500/60"
                                )}
                              />
                              {importError && (
                                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1.5">
                                  <AlertTriangle className="w-3 h-3" /> {importError}
                                </p>
                              )}
                              <div className="flex items-start gap-3 p-3.5 bg-amber-500/8 border border-amber-500/20 rounded-xl mt-3">
                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-300/80 leading-relaxed">
                                  Your private key never leaves your device. OrahDEX processes it locally only to derive your address — it is never stored or sent.
                                </p>
                              </div>
                              <button
                                onClick={handleImportPrivateKey}
                                disabled={importPrivKey.trim().length === 0}
                                className={cn("w-full py-3.5 rounded-xl font-bold text-sm transition-all mt-3",
                                  importPrivKey.trim().length > 0
                                    ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20"
                                    : "bg-white/5 text-muted-foreground cursor-not-allowed"
                                )}
                              >
                                Import EVM Wallet
                              </button>
                            </div>
                          ) : (
                            /* Seed phrase input */
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Seed Phrase</p>
                                <span className="text-xs text-muted-foreground">{importInput.trim().split(/\s+/).filter(Boolean).length} words</span>
                              </div>
                              <textarea
                                value={importInput}
                                onChange={e => { setImportInput(e.target.value); setImportError(null); }}
                                placeholder="Enter your 12 or 24-word seed phrase, separated by spaces..."
                                rows={4}
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
                              <div className="flex gap-2 mt-2">
                                {[12, 24].map(n => (
                                  <span key={n} className="px-2.5 py-1 bg-white/5 border border-border text-muted-foreground text-xs rounded-full">{n} words</span>
                                ))}
                                <span className="text-xs text-muted-foreground self-center">BIP39</span>
                              </div>
                              <div className="flex items-start gap-3 p-3.5 bg-amber-500/8 border border-amber-500/20 rounded-xl mt-3">
                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-300/80 leading-relaxed">
                                  Never enter your seed phrase on untrusted sites. OrahDEX never stores or transmits your phrase — all derivation is local.
                                </p>
                              </div>
                              <button
                                onClick={handleImport}
                                disabled={importInput.trim().length === 0 || hdDeriving}
                                className={cn("w-full py-3.5 rounded-xl font-bold text-sm transition-all mt-3 flex items-center justify-center gap-2",
                                  importInput.trim().length > 0 && !hdDeriving
                                    ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20"
                                    : "bg-white/5 text-muted-foreground cursor-not-allowed"
                                )}
                              >
                                {hdDeriving ? <><Loader2 className="w-4 h-4 animate-spin" /> Deriving Addresses…</> : "Import OrahDEX Wallet"}
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      {importStep === "done" && hdAddresses && (
                        <div className="py-6 flex flex-col items-center gap-4">
                          <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
                            <CheckCircle2 className="w-8 h-8 text-primary" />
                          </div>
                          <div className="text-center">
                            <h3 className="text-xl font-bold">Wallet Imported!</h3>
                            <p className="text-xs text-muted-foreground mt-1">Tap a chain to connect with that address</p>
                          </div>
                          <div className="w-full space-y-2">
                            {[
                              { label: "EVM", sub: "ETH · BSC · Polygon · Arbitrum…", addr: hdAddresses.evm, color: "blue",    net: "evm" as WalletNetwork },
                              { label: "SOL", sub: "Solana · Phantom-compatible",      addr: hdAddresses.sol, color: "violet",  net: "sol" as WalletNetwork },
                              { label: "BTC", sub: "Bitcoin · m/44'/0'/0'/0/0",        addr: hdAddresses.btc, color: "orange",  net: "btc" as WalletNetwork },
                              { label: "BCH", sub: "Bitcoin Cash · CashAddr",          addr: hdAddresses.bch, color: "green",   net: null },
                              { label: "BSV", sub: "Bitcoin SV · m/44'/236'/0'/0/0",   addr: hdAddresses.bsv, color: "emerald", net: "bsv" as WalletNetwork },
                            ].map(({ label, sub, addr, color, net }) => {
                              const isActive = walletState.network === net && net !== null;
                              const inner = (
                                <>
                                  <span className={`text-xs font-black text-${color}-400 w-8 shrink-0`}>{label}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-muted-foreground">{sub}</p>
                                    <p className="text-xs font-mono text-foreground truncate">{addr}</p>
                                  </div>
                                  {net && !isActive && <span className="text-[9px] text-muted-foreground/50 shrink-0">Tap to use</span>}
                                  {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                                </>
                              );
                              return net ? (
                                <button
                                  key={label}
                                  onClick={() => { walletState.switchNetworkType(net); onClose(); }}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                                    ${isActive ? `bg-${color}-500/15 border-${color}-500/40` : `bg-${color}-500/8 border-${color}-500/20 hover:bg-${color}-500/15 hover:border-${color}-500/40`}`}
                                >
                                  {inner}
                                </button>
                              ) : (
                                <div key={label} className={`flex items-center gap-3 p-3 rounded-xl bg-${color}-500/8 border border-${color}-500/20 opacity-50`}>
                                  {inner}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── CONNECT ── */}
                  {view === "connect" && (
                    <motion.div key="connect" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>

                      {connectError && (
                        <div className="mx-6 mt-4 flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-300 leading-relaxed flex-1">{connectError}</p>
                          <button onClick={() => setConnectError(null)} className="text-red-400/60 hover:text-red-400 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* 4-way tab: EVM · SOL · BTC · BSV */}
                      <div className="flex border-b border-border mt-4 px-6 gap-1">
                        {CONNECT_TABS.map(tab => (
                          <button key={tab.id}
                            onClick={() => { setConnectTab(tab.id); setConnectError(null); setBsvStep("list"); }}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition-all",
                              connectTab === tab.id
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            )}>
                            <span>{tab.emoji}</span>
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* ── BSV sub-step forms ──────────────────────────────────────────── */}
                      {connectTab === "bsv" && bsvStep !== "list" ? (
                        <div className="p-6 space-y-5">
                          {/* Back button */}
                          <button
                            onClick={() => { setBsvStep("list"); setConnectError(null); }}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" /> Back to BSV wallets
                          </button>

                          {/* ── HandCash handle lookup ── */}
                          {bsvStep === "handcash" && (
                            <>
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-secondary/60 flex items-center justify-center text-2xl shrink-0">✋</div>
                                <div>
                                  <p className="font-bold text-base">HandCash</p>
                                  <p className="text-xs text-muted-foreground">Enter your $handle — your BSV paymail address</p>
                                </div>
                              </div>

                              <div>
                                <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">HandCash Handle</label>
                                <div className="relative">
                                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary font-bold text-sm select-none">$</span>
                                  <input
                                    value={bsvHandle}
                                    onChange={e => {
                                      setBsvHandle(e.target.value.replace(/^\$/, ""));
                                      setBsvHandleState("idle");
                                      setBsvHandleErr("");
                                      setBsvResolvedAddr("");
                                      setBsvHandleFallback(false);
                                      setBsvDisplayName("");
                                      setBsvAvatarUrl(null);
                                    }}
                                    onKeyDown={e => e.key === "Enter" && lookupHandCash()}
                                    placeholder="yourhandle"
                                    autoFocus
                                    className="w-full bg-secondary/40 border border-border rounded-xl pl-8 pr-4 py-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-all"
                                  />
                                </div>
                              </div>

                              {bsvHandleState === "found" && bsvResolvedAddr && (
                                <div className={`p-3.5 rounded-xl space-y-2 ${bsvHandleFallback ? "bg-amber-500/10 border border-amber-500/30" : "bg-green-500/10 border border-green-500/30"}`}>
                                  <div className="flex items-center gap-2">
                                    {bsvAvatarUrl && (
                                      <img src={bsvAvatarUrl} alt="" className="w-8 h-8 rounded-full border border-border shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-[11px] font-bold uppercase tracking-wider ${bsvHandleFallback ? "text-amber-400" : "text-green-400"}`}>
                                        {bsvHandleFallback ? "✦ Using paymail format" : "✓ Handle resolved"}
                                      </p>
                                      {bsvDisplayName && bsvDisplayName !== `$${bsvHandle}` && (
                                        <p className="text-xs text-foreground font-semibold">{bsvDisplayName}</p>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-xs font-mono text-foreground break-all">{bsvResolvedAddr}</p>
                                  {bsvHandleFallback && (
                                    <p className="text-[10px] text-amber-400/80 leading-relaxed">
                                      HandCash's API is currently unreachable — your paymail address (<span className="font-mono">{bsvHandle}@handcash.io</span>) is used directly, which is valid for BSV payments.
                                    </p>
                                  )}
                                </div>
                              )}

                              {bsvHandleState === "error" && (
                                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-red-300 leading-relaxed">{bsvHandleErr}</p>
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                      You can also enter your paymail directly: <span className="font-mono text-foreground">{bsvHandle || "handle"}@handcash.io</span>
                                    </p>
                                  </div>
                                </div>
                              )}

                              {bsvHandleState !== "found" ? (
                                <button
                                  onClick={lookupHandCash}
                                  disabled={bsvHandleState === "loading" || !bsvHandle.trim()}
                                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                  {bsvHandleState === "loading" ? (
                                    <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Resolving handle…</span>
                                  ) : "Look Up $Handle"}
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  <button
                                    onClick={async () => {
                                      connect({ address: bsvResolvedAddr, provider: "handcash", network: "bsv" });
                                      // Fetch BSV balance in background after connecting
                                      fetchBsvBalance(bsvResolvedAddr).then(result => {
                                        if (result && result.balance !== undefined && result.error !== "paymail_unresolved") {
                                          setBalance(result.balance.toFixed(8));
                                        }
                                      }).catch(() => {});
                                      goToPrep(bsvResolvedAddr, "bsv", "handcash");
                                    }}
                                    className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
                                  >
                                    <CheckCircle2 className="w-4 h-4" /> Connect as ${bsvHandle}
                                  </button>
                                  <button
                                    onClick={() => { setBsvHandleState("idle"); setBsvResolvedAddr(""); setBsvHandleFallback(false); }}
                                    className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    ← Try a different handle
                                  </button>
                                </div>
                              )}

                              <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
                                Your BSV paymail is <span className="font-mono">{bsvHandle || "handle"}@handcash.io</span> — OrahDEX never stores your keys.
                              </p>
                            </>
                          )}

                          {/* ── RelayX — extension not found ── */}
                          {bsvStep === "relayx" && (
                            <>
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-secondary/60 flex items-center justify-center text-2xl shrink-0">⚡</div>
                                <div>
                                  <p className="font-bold text-base">RelayX</p>
                                  <p className="text-xs text-muted-foreground">Browser extension not detected</p>
                                </div>
                              </div>
                              <div className="p-3.5 bg-green-500/8 border border-green-500/20 rounded-xl flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                <div className="space-y-2">
                                  <p className="text-xs text-green-300/90 leading-relaxed">RelayX extension was not found in your browser. Install it or paste your BSV address manually.</p>
                                  <a href="https://relayx.com" target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold">
                                    Install RelayX <ChevronRight className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">Your BSV Address</label>
                                <input
                                  value={bsvManualAddr}
                                  onChange={e => setBsvManualAddr(e.target.value)}
                                  placeholder="1YourBSVAddress..."
                                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-all"
                                />
                              </div>
                              <button
                                onClick={() => confirmBsvManual("relayx")}
                                disabled={!bsvManualAddr.trim()}
                                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                Connect with Address
                              </button>
                            </>
                          )}

                          {/* ── Panda Wallet — extension not found ── */}
                          {bsvStep === "panda" && (
                            <>
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-secondary/60 flex items-center justify-center text-2xl shrink-0">🐼</div>
                                <div>
                                  <p className="font-bold text-base">Panda Wallet</p>
                                  <p className="text-xs text-muted-foreground">Browser extension not detected</p>
                                </div>
                              </div>
                              <div className="p-3.5 bg-green-500/8 border border-green-500/20 rounded-xl flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                <div className="space-y-2">
                                  <p className="text-xs text-green-300/90 leading-relaxed">Panda Wallet extension was not found. Install it or enter your BSV address manually.</p>
                                  <a href="https://chromewebstore.google.com/detail/panda-wallet/mlbnicldlpdimbjdcncnklfempedekim" target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold">
                                    Install Panda Wallet <ChevronRight className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">Your BSV Address</label>
                                <input
                                  value={bsvManualAddr}
                                  onChange={e => setBsvManualAddr(e.target.value)}
                                  placeholder="1YourBSVAddress..."
                                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-all"
                                />
                              </div>
                              <button
                                onClick={() => confirmBsvManual("panda")}
                                disabled={!bsvManualAddr.trim()}
                                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                Connect with Address
                              </button>
                            </>
                          )}

                          {/* ── Sensilet — extension not found ── */}
                          {bsvStep === "sensilet" && (
                            <>
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-secondary/60 flex items-center justify-center text-2xl shrink-0">🔷</div>
                                <div>
                                  <p className="font-bold text-base">Sensilet</p>
                                  <p className="text-xs text-muted-foreground">Browser extension not detected</p>
                                </div>
                              </div>
                              <div className="p-3.5 bg-green-500/8 border border-green-500/20 rounded-xl flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                <div className="space-y-2">
                                  <p className="text-xs text-green-300/90 leading-relaxed">Sensilet extension was not found. Install it or enter your BSV address manually.</p>
                                  <a href="https://sensilet.com" target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold">
                                    Install Sensilet <ChevronRight className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">Your BSV Address</label>
                                <input
                                  value={bsvManualAddr}
                                  onChange={e => setBsvManualAddr(e.target.value)}
                                  placeholder="1YourBSVAddress..."
                                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-all"
                                />
                              </div>
                              <button
                                onClick={() => confirmBsvManual("sensilet")}
                                disabled={!bsvManualAddr.trim()}
                                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                Connect with Address
                              </button>
                            </>
                          )}

                          {/* ── Generic manual entry (Guarda, Atomic, Twetch, Yours) ── */}
                          {bsvStep === "manual" && (
                            <>
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-secondary/60 flex items-center justify-center text-xl shrink-0">
                                  {BSV_WALLETS.find(w => w.name === bsvManualWallet)?.icon ?? "🔑"}
                                </div>
                                <div>
                                  <p className="font-bold text-base">{bsvManualWallet}</p>
                                  <p className="text-xs text-muted-foreground">Paste your BSV receiving address</p>
                                </div>
                              </div>
                              <div className="p-3.5 bg-blue-500/8 border border-blue-500/20 rounded-xl">
                                <p className="text-xs text-blue-300/80 leading-relaxed">
                                  Open {bsvManualWallet}, copy your Bitcoin SV receiving address, and paste it below. OrahDEX uses it for settlement only — your keys stay in your wallet.
                                </p>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">BSV Receiving Address</label>
                                <input
                                  value={bsvManualAddr}
                                  onChange={e => setBsvManualAddr(e.target.value)}
                                  placeholder="1YourBSVAddress..."
                                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-all"
                                />
                              </div>
                              <button
                                onClick={() => confirmBsvManual(BSV_WALLETS.find(w => w.name === bsvManualWallet)?.id ?? "manual")}
                                disabled={!bsvManualAddr.trim()}
                                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                Connect {bsvManualWallet}
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Reown tab — full-panel content */}
                          {connectTab === "reown" && (
                            <div className="p-6">
                              <ReownConnectPanel onConnected={() => handleClose()} />
                            </div>
                          )}

                          {/* Network description */}
                          {connectTab === "bsv" && (
                          <div className="px-6 pt-3 pb-1">
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              Connect your Bitcoin SV wallet. BSV is the primary settlement layer for all OrahDEX trades — instant, on-chain, sub-cent fees.
                            </p>
                          </div>
                          )}
                          {connectTab === "tron" && (
                          <div className="px-6 pt-3 pb-1">
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              Connect your TRON wallet to access TRX, USDT (TRC-20), BTT, WIN, JST and all TRON ecosystem liquidity pools.
                            </p>
                          </div>
                          )}

                          {connectTab !== "reown" && (
                          <div className="p-4 space-y-2">
                            {currentWallets.map(wallet => {
                              const isConn = connecting === wallet.id;
                              const isDone = connected === wallet.id;
                              return (
                                <button key={wallet.id}
                                  disabled={!!connecting}
                                  onClick={() => handleConnect(wallet.id, wallet.installUrl)}
                                  className={cn(
                                    "w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all",
                                    isDone ? "border-green-500/60 bg-green-500/8"
                                      : isConn ? "border-primary/60 bg-primary/8"
                                      : "border-border hover:border-primary/40 hover:bg-primary/5",
                                    connecting && !isConn && "opacity-40 cursor-not-allowed"
                                  )}>
                                  <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center text-xl shrink-0">
                                    {isConn ? <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                                      : isDone ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                                      : wallet.icon}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm flex items-center gap-2">
                                      {wallet.name}
                                      {wallet.popular && (
                                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded uppercase tracking-wider">Popular</span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{wallet.description}</p>
                                  </div>
                                  {isDone
                                    ? <Check className="w-4 h-4 text-green-400 shrink-0" />
                                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                          )}
                        </>
                      )}

                      {/* BSV fastest settlement note */}
                      {connectTab === "bsv" && (
                        <div className="mx-6 mb-4 flex items-start gap-2.5 p-3 bg-primary/8 border border-primary/20 rounded-xl">
                          <Shield className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          <p className="text-[11px] text-primary/80">
                            BSV (Bitcoin SV) is OrahDEX's primary settlement currency — sub-cent fees, instant confirmation, unlimited scale.
                          </p>
                        </div>
                      )}
                      {/* TRON note */}
                      {connectTab === "tron" && (
                        <div className="mx-6 mb-4 flex items-start gap-2.5 p-3 bg-red-500/8 border border-red-500/20 rounded-xl">
                          <Shield className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-red-300/80">
                            TRON supports USDT (TRC-20) — the world's most-used stablecoin network — plus BTT, WIN, JST and the full TRON DeFi ecosystem.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── PREP (Wallet Setup) ── */}
                  {view === "prep" && (
                    <motion.div key="prep" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                      className="p-6 flex flex-col items-center text-center gap-5">

                      {/* Success animation */}
                      <div className="relative mt-2">
                        <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center border border-green-500/30">
                          <CheckCircle2 className="w-10 h-10 text-green-400" />
                        </div>
                        <div className="absolute inset-0 rounded-full border-2 border-green-500/30 animate-ping opacity-40" />
                      </div>

                      <div>
                        <h3 className="text-xl font-black text-foreground mb-1">You're Connected!</h3>
                        <p className="text-sm text-muted-foreground">
                          {prepNetwork === "bsv"
                            ? "BSV wallet ready — native on-chain settlement"
                            : prepNetwork === "evm"
                            ? "EVM wallet ready — signs orders, settles on BSV"
                            : prepNetwork === "sol"
                            ? "Solana wallet ready — trades settle via BSV bridge"
                            : prepNetwork === "tron"
                            ? "TRON wallet ready — TRX, USDT-TRC20, BTT & more"
                            : "Bitcoin wallet ready — connected to OrahDEX"}
                        </p>
                      </div>

                      {/* Address display */}
                      <div className="w-full flex items-center gap-2 bg-secondary/60 border border-border rounded-xl px-3 py-2.5">
                        <div className="w-2 h-2 rounded-full bg-green-400 shrink-0 animate-pulse" />
                        <span className="flex-1 text-left font-mono text-[11px] text-foreground truncate">
                          {prepAddr}
                        </span>
                        <button
                          onClick={() => navigator.clipboard?.writeText(prepAddr)}
                          className="shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          title="Copy address"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Network + provider badge */}
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border",
                          prepNetwork === "bsv"  ? "bg-green-500/15 border-green-500/30 text-green-400"
                          : prepNetwork === "evm"  ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                          : prepNetwork === "sol"  ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                          : prepNetwork === "tron" ? "bg-red-500/15 border-red-500/30 text-red-400"
                          : "bg-orange-500/15 border-orange-500/30 text-orange-400"
                        )}>
                          {prepNetwork.toUpperCase()}
                        </span>
                        {prepProvider && (
                          <span className="text-[10px] font-semibold text-muted-foreground capitalize bg-white/5 border border-border px-2 py-0.5 rounded-full">
                            {prepProvider === "aura-wallet" || prepProvider === "passkey" ? "OrahDEX Wallet" : prepProvider}
                          </span>
                        )}
                      </div>

                      {/* EVM token balances — shown right after connecting */}
                      {prepNetwork === "evm" && (
                        <div className="w-full">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              Wallet Balances · {getChainName(walletState.chainId ?? 1)}
                            </p>
                            <button
                              onClick={refreshPrepBal}
                              disabled={prepBalLoading}
                              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-30"
                            >
                              <RefreshCw className={cn("w-3 h-3", prepBalLoading && "animate-spin")} />
                            </button>
                          </div>
                          {prepBalLoading && prepEvmBalances.length === 0 ? (
                            <div className="space-y-2">
                              {[1, 2].map(i => (
                                <div key={i} className="h-9 bg-white/5 rounded-xl animate-pulse" />
                              ))}
                            </div>
                          ) : prepEvmBalances.length === 0 ? (
                            <div className="text-center py-3 bg-white/3 rounded-xl border border-border/50">
                              <p className="text-[11px] text-muted-foreground">No tokens found on this network</p>
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Deposit funds to start trading</p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {prepEvmBalances.slice(0, 5).map(b => (
                                <div key={b.symbol} className="flex items-center justify-between px-3 py-2 bg-white/4 rounded-xl border border-border/40">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black"
                                      style={{ backgroundColor: b.color + "33", color: b.color }}
                                    >
                                      {b.symbol[0]}
                                    </div>
                                    <span className="text-xs font-semibold text-foreground">{b.symbol}</span>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs font-mono text-foreground">
                                      {b.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      ${b.usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Primary CTA */}
                      <button
                        onClick={handleClose}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white font-black text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                        Start Trading →
                      </button>

                      {/* Deposit hint */}
                      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs">
                        Deposit{" "}
                        <span className="text-foreground font-medium">
                          {prepNetwork === "bsv" ? "BSV" : prepNetwork === "evm" ? "ETH / tokens" : prepNetwork === "sol" ? "SOL" : "BTC"}
                        </span>{" "}
                        to your address above to fund trades. All trades settle permanently on the BSV blockchain.
                      </p>

                    </motion.div>
                  )}

                  {/* ── PASSKEY VIEW ── */}
                  {view === "passkey" && (
                    <motion.div key="passkey" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      className="p-5 space-y-4">

                      {/* Passkey hero */}
                      <div className="flex flex-col items-center py-4 text-center">
                        <div className={cn(
                          "w-20 h-20 rounded-3xl flex items-center justify-center mb-4 transition-all",
                          passkeyStep === "registering" || passkeyStep === "logging_in"
                            ? "bg-primary/30 border-2 border-primary/50 animate-pulse"
                            : passkeyStep === "done"
                              ? "bg-green-500/20 border-2 border-green-500/40"
                              : passkeyStep === "error"
                                ? "bg-red-500/15 border-2 border-red-500/30"
                                : "bg-primary/15 border-2 border-primary/30"
                        )}>
                          {passkeyStep === "registering" || passkeyStep === "logging_in"
                            ? <Loader2 className="w-10 h-10 text-primary animate-spin" />
                            : passkeyStep === "done"
                              ? <CheckCircle2 className="w-10 h-10 text-green-400" />
                              : passkeyStep === "error"
                                ? <AlertTriangle className="w-10 h-10 text-red-400" />
                                : <Fingerprint className="w-10 h-10 text-primary" />
                          }
                        </div>

                        {passkeyStep === "idle" && (
                          <>
                            <h3 className="text-lg font-bold mb-1">No seed phrase needed</h3>
                            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                              Your wallet is protected by your device biometrics — Face ID, Touch ID, fingerprint, or PIN.
                              No one can access it without your passkey.
                            </p>
                          </>
                        )}
                        {(passkeyStep === "registering") && (
                          <>
                            <h3 className="text-lg font-bold mb-1">Creating your wallet…</h3>
                            <p className="text-sm text-muted-foreground">Approve the passkey prompt on your device</p>
                          </>
                        )}
                        {passkeyStep === "logging_in" && (
                          <>
                            <h3 className="text-lg font-bold mb-1">Authenticating…</h3>
                            <p className="text-sm text-muted-foreground">Use biometrics or your passkey to sign in</p>
                          </>
                        )}
                        {passkeyStep === "done" && passkeyResult && (
                          <>
                            <h3 className="text-lg font-bold text-green-400 mb-1">
                              {restoredFromBackup ? "Wallet Restored!" : "Wallet Ready!"}
                            </h3>
                            <p className="text-sm text-muted-foreground mb-3">
                              {restoredFromBackup
                                ? "Your wallet was recovered from cloud backup and saved to this device."
                                : "Connecting to OrahDEX…"}
                            </p>
                            {passkeyResult.chains && (
                              <div className="w-full space-y-1.5">
                                {[
                                  { label: "EVM", sub: "ETH · BSC · Polygon · Arbitrum…", addr: passkeyResult.chains.evm, color: "blue" },
                                  { label: "SOL", sub: "Solana · Phantom-compatible", addr: passkeyResult.chains.sol, color: "violet" },
                                  { label: "BTC", sub: "Bitcoin", addr: passkeyResult.chains.btc, color: "orange" },
                                  { label: "BCH", sub: "Bitcoin Cash · CashAddr", addr: passkeyResult.chains.bch, color: "green" },
                                  { label: "BSV", sub: "Bitcoin SV", addr: passkeyResult.chains.bsv, color: "emerald" },
                                ].filter(r => r.addr).map(({ label, sub, addr, color }) => (
                                  <div key={label} className={`flex items-center gap-2 p-2 rounded-lg bg-${color}-500/8 border border-${color}-500/20`}>
                                    <span className={`text-[10px] font-black text-${color}-400 w-7 shrink-0`}>{label}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[9px] text-muted-foreground">{sub}</p>
                                      <p className="text-[10px] font-mono text-foreground/80 truncate">{addr}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        {passkeyStep === "error" && (
                          <>
                            <h3 className="text-lg font-bold text-red-400 mb-1">
                              {passkeyError?.startsWith("WALLET_NOT_FOUND") ? "Wallet Not on This Device" : "Something went wrong"}
                            </h3>
                            {passkeyError?.startsWith("WALLET_NOT_FOUND") ? (
                              <div className="text-left w-full max-w-xs space-y-1.5">
                                <p className="text-sm text-muted-foreground">Your passkey verified but the wallet isn't backed up yet. To get a transfer code:</p>
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 space-y-1">
                                  <p className="text-[11px] text-amber-300 font-bold">Steps on your original browser/device:</p>
                                  <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
                                    <li>Open OrahDEX on the browser where you <span className="text-foreground font-semibold">first created this wallet</span></li>
                                    <li>Tap <span className="text-foreground font-semibold">Connect</span> → <span className="text-foreground font-semibold">Passkey</span> tab</li>
                                    <li>Tap the <span className="text-amber-400 font-bold">Transfer</span> button next to your wallet</li>
                                    <li>Copy the 8-character code that appears</li>
                                    <li>Enter it below on this device</li>
                                  </ol>
                                </div>
                                <p className="text-[10px] text-muted-foreground">Your wallet will also auto-backup the next time you log in from your original browser, making future cross-device logins seamless.</p>
                              </div>
                            ) : (
                              <p className="text-sm text-red-400/80 max-w-xs">{passkeyError}</p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Existing passkey wallets */}
                      {storedPasskeys.length > 0 && passkeyStep === "idle" && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Passkey wallets on this device</p>
                          {storedPasskeys.map(w => (
                            <div key={w.credentialId} className="rounded-xl bg-secondary border border-border overflow-hidden">
                              <div className="flex items-center gap-3 p-3">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                  <Fingerprint className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold truncate">{w.label ?? "Passkey Wallet"}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono truncate">{w.address}</div>
                                </div>
                                <button
                                  onClick={() => handleGenerateQr(w.credentialId)}
                                  title="Generate transfer code"
                                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 transition-all"
                                >
                                  {qrLoading && qrWalletId === w.credentialId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                  {qrWalletId === w.credentialId && qrCode ? "Hide" : "Transfer"}
                                </button>
                              </div>
                              {/* Transfer Code + QR panel */}
                              {qrWalletId === w.credentialId && (
                                <div className="border-t border-border p-3 bg-background/50 space-y-3">
                                  {qrError ? (
                                    <p className="text-[11px] text-red-400">{qrError}</p>
                                  ) : qrCode ? (
                                    <>
                                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Enter this code on your new device in the "Use a transfer code" section. Valid for <span className="text-amber-400 font-bold">10 minutes</span>, one-time use.
                                      </p>
                                      <div className="flex items-center gap-4">
                                        <div className="p-2 bg-white rounded-lg" style={{ colorScheme: "light" }}>
                                          <QRCodeCanvas value={qrCode} size={80} level="M" bgColor="#ffffff" fgColor="#000000" />
                                        </div>
                                        <div className="flex-1">
                                          <p className="text-[10px] text-muted-foreground mb-1">Transfer Code</p>
                                          <div className="font-mono text-xl font-black tracking-widest text-amber-400 select-all">{qrCode}</div>
                                          <p className="text-[10px] text-muted-foreground mt-1">Scan QR or type code manually</p>
                                        </div>
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      {passkeyStep === "idle" && (
                        <div className="space-y-2">
                          <button
                            onClick={handlePasskeyLogin}
                            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl bg-primary text-primary-foreground font-black text-base hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/25"
                          >
                            <Fingerprint className="w-5 h-5" />
                            Sign In with Passkey
                          </button>
                          {/* Create new wallet */}
                          <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Create a new passkey wallet</p>
                            <input
                              type="text"
                              value={passkeyLabel}
                              onChange={e => setPasskeyLabel(e.target.value)}
                              placeholder="Wallet name (optional)"
                              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                            />
                            <button
                              onClick={handlePasskeyRegister}
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm border border-primary/40 text-primary hover:bg-primary/10 transition-all"
                            >
                              <PlusCircle className="w-4 h-4" />
                              Create Passkey Wallet
                            </button>
                          </div>
                        </div>
                      )}

                      {passkeyStep === "error" && (
                        <div className="space-y-2 w-full">
                          {passkeyError?.startsWith("WALLET_NOT_FOUND") ? (
                            <>
                              {/* Recovery option 1: Enter transfer code from old device */}
                              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                  <Key className="w-3.5 h-3.5 text-amber-400" />
                                  Use a transfer code from your old device
                                </p>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                  Enter the 8-character code shown on your original browser.
                                </p>
                                <div className="space-y-2">
                                    <input
                                      type="text"
                                      value={transferCodeInput}
                                      onChange={e => setTransferCodeInput(e.target.value.toUpperCase().slice(0, 8))}
                                      placeholder="e.g. ABCD1234"
                                      maxLength={8}
                                      className="w-full bg-background border border-amber-500/30 rounded-lg px-3 py-2 text-sm font-mono uppercase tracking-widest text-center focus:outline-none focus:border-amber-500/60"
                                    />
                                    {transferCodeError && (
                                      <p className="text-[11px] text-red-400">{transferCodeError}</p>
                                    )}
                                    <button
                                      disabled={transferCodeInput.length < 8 || transferCodeLoading}
                                      onClick={async () => {
                                        setTransferCodeLoading(true);
                                        setTransferCodeError(null);
                                        try {
                                          // We need the passkey assertion rawId to decrypt — trigger login flow
                                          // The loginWithPasskey function will auto-detect the locally saved backup;
                                          // for transfer code we use a separate approach: authenticate then restore
                                          const { restoreFromTransferCode } = await import("@/lib/passkeyWallet");
                                          const challenge = crypto.getRandomValues(new Uint8Array(32));
                                          const assertion = await navigator.credentials.get({
                                            publicKey: { challenge, allowCredentials: [], userVerification: "required", timeout: 60_000 },
                                          }) as PublicKeyCredential | null;
                                          if (!assertion) throw new Error("Authentication cancelled");
                                          const wallet = await restoreFromTransferCode(transferCodeInput, assertion.rawId);
                                          setStoredPasskeys(listPasskeyWallets());
                                          setPasskeyResult({ address: wallet.address, label: wallet.label ?? "Passkey Wallet" });
                                          setRestoredFromBackup(true);
                                          setPasskeyStep("done");
                                          connect({ address: wallet.address, provider: "aura-wallet", network: "evm" });
                                          setTimeout(() => goToPrep(wallet.address, "evm", "passkey"), 2000);
                                        } catch (err: any) {
                                          setTransferCodeError(err?.message ?? "Transfer failed");
                                        } finally {
                                          setTransferCodeLoading(false);
                                        }
                                      }}
                                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                      {transferCodeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                      Restore Wallet
                                    </button>
                                  </div>
                              </div>

                              {/* Recovery option 2: create a fresh passkey wallet */}
                              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                  <PlusCircle className="w-3.5 h-3.5 text-primary" />
                                  Create a new passkey wallet
                                </p>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                  Generates a brand-new EVM wallet. Your old wallet address will change.
                                </p>
                                <button
                                  onClick={() => { setPasskeyStep("idle"); setPasskeyError(null); handlePasskeyRegister(); }}
                                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all"
                                >
                                  <Fingerprint className="w-4 h-4" />
                                  Create New Passkey Wallet
                                </button>
                              </div>

                              {/* Recovery option 3: import private key */}
                              <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
                                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                  <Key className="w-3.5 h-3.5 text-muted-foreground" />
                                  Restore with private key or seed phrase
                                </p>
                                <button
                                  onClick={() => { setPasskeyStep("idle"); setPasskeyError(null); setImportNetwork("evm"); setImportMode("privatekey"); setImportError(null); setView("import"); }}
                                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                                >
                                  Import Private Key / Seed Phrase
                                </button>
                              </div>

                              {/* Back */}
                              <button
                                onClick={() => { setPasskeyStep("idle"); setPasskeyError(null); setShowTransferCodeInput(false); setTransferCodeInput(""); setTransferCodeError(null); }}
                                className="w-full py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                ← Back
                              </button>
                            </>
                          ) : (
                            /* Generic error — just try again */
                            <button
                              onClick={() => { setPasskeyStep("idle"); setPasskeyError(null); }}
                              className="w-full py-3 rounded-xl bg-secondary text-foreground font-semibold hover:bg-secondary/80 transition-colors"
                            >
                              Try Again
                            </button>
                          )}
                        </div>
                      )}

                      {/* Security note */}
                      {passkeyStep === "idle" && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-500/5 border border-green-500/15">
                          <Shield className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                          <div className="text-[11px] text-muted-foreground leading-relaxed">
                            <span className="text-green-400 font-semibold">Non-custodial with cloud recovery.</span>{" "}
                            Your private key is encrypted with AES-256 and only decryptable with your biometrics.
                            A secure backup is kept on our server for cross-device recovery. OrahDEX can never see your key.
                          </div>
                        </div>
                      )}

                    </motion.div>
                  )}

                  {/* ── MOBILE QR CONNECT ── */}
                  {view === "mobileqr" && (
                    <motion.div key="mobileqr" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      className="p-6 flex flex-col items-center gap-6">

                      {/* Status icon */}
                      <div className={cn(
                        "w-20 h-20 rounded-3xl flex items-center justify-center transition-all",
                        mqrStatus === "connected"
                          ? "bg-green-500/20 border-2 border-green-500/40"
                          : mqrStatus === "expired" || mqrStatus === "error"
                            ? "bg-red-500/12 border-2 border-red-500/25"
                            : "bg-white/8 border-2 border-white/15"
                      )}>
                        {mqrStatus === "connected"
                          ? <CheckCircle2 className="w-10 h-10 text-green-400" />
                          : mqrStatus === "expired" || mqrStatus === "error"
                            ? <AlertTriangle className="w-10 h-10 text-red-400" />
                            : <Smartphone className="w-10 h-10 text-white/60" />
                        }
                      </div>

                      {/* Title & subtitle */}
                      <div className="text-center">
                        {mqrStatus === "connected" && (
                          <>
                            <h3 className="text-xl font-bold text-green-400 mb-1">Wallet Connected!</h3>
                            <p className="text-sm text-muted-foreground">
                              {mqrAddress ? `${mqrAddress.slice(0, 8)}…${mqrAddress.slice(-6)}` : ""} is now linked. Redirecting…
                            </p>
                          </>
                        )}
                        {(mqrStatus === "expired" || mqrStatus === "error") && (
                          <>
                            <h3 className="text-xl font-bold text-red-400 mb-1">{mqrStatus === "expired" ? "QR Expired" : "Error"}</h3>
                            <p className="text-sm text-muted-foreground">Generate a new QR code and try again.</p>
                          </>
                        )}
                        {mqrStatus === "pending" && (
                          <>
                            <h3 className="text-xl font-bold mb-1">Scan with your phone</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              Open OrahDEX on mobile → tap the QR icon → point your camera here.
                            </p>
                          </>
                        )}
                      </div>

                      {/* QR code (only when pending + token available) */}
                      {mqrStatus === "pending" && mqrToken && (
                        <div className="flex flex-col items-center gap-3 w-full">
                          <div className="p-4 bg-white rounded-2xl shadow-lg" style={{ colorScheme: "light" }}>
                            <QRCodeCanvas
                              value={`orahdex://connect?token=${mqrToken}&expires=${mqrExpires}`}
                              size={200}
                              bgColor="#ffffff"
                              fgColor="#000000"
                              level="M"
                              marginSize={0}
                            />
                          </div>

                          {/* Waiting indicator */}
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className="w-4 h-4 rounded-full border-2 border-primary/60 border-t-primary animate-spin" />
                            Waiting for mobile scan…
                          </div>

                          {/* Expiry */}
                          <p className="text-[11px] text-muted-foreground/50">
                            Expires {new Date(mqrExpires).toLocaleTimeString()}
                          </p>
                        </div>
                      )}

                      {/* Loading while creating session */}
                      {mqrStatus === "pending" && !mqrToken && (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-10 h-10 rounded-full border-2 border-primary/50 border-t-primary animate-spin" />
                          <p className="text-sm text-muted-foreground">Generating QR code…</p>
                        </div>
                      )}

                      {/* How-to steps */}
                      {mqrStatus === "pending" && (
                        <div className="w-full rounded-2xl border border-white/10 bg-white/3 p-4 space-y-3">
                          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">How to connect</p>
                          {[
                            { n: "1", text: "Open OrahDEX on your mobile device" },
                            { n: "2", text: "Tap the QR icon in the top bar" },
                            { n: "3", text: "Point your camera at this QR code" },
                            { n: "4", text: "Tap \"Connect Wallet\" on your phone" },
                          ].map(({ n, text }) => (
                            <div key={n} className="flex items-start gap-3">
                              <span className="w-5 h-5 rounded-full bg-white/10 text-white/60 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                              <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Refresh / retry buttons */}
                      {(mqrStatus === "expired" || mqrStatus === "error") && (
                        <button
                          onClick={startMobileQRSession}
                          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:brightness-110 transition-all"
                        >
                          <RefreshCw className="w-4 h-4" /> Generate New QR
                        </button>
                      )}

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
