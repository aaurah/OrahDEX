import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Shield, ChevronRight, CheckCircle2,
  PlusCircle, Download, Link2, Copy, Check,
  Eye, AlertTriangle, RefreshCw, ArrowLeft,
  Layers,
} from "lucide-react";
import { useWalletStore, type WalletNetwork } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";
import { generateMnemonic, deriveAddress, validateMnemonic } from "@/lib/seedPhrase";

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

type View = "landing" | "create" | "import" | "connect" | "prep";
type ConnectTab = "bsv" | "evm" | "sol" | "btc";
type CreateStep = "generate" | "done";
type ImportStep = "enter" | "done";

const CONNECT_TABS: { id: ConnectTab; label: string; emoji: string }[] = [
  { id: "bsv", label: "BSV",     emoji: "⚡" },
  { id: "evm", label: "EVM",     emoji: "🌐" },
  { id: "sol", label: "Solana",  emoji: "◎" },
  { id: "btc", label: "Bitcoin", emoji: "₿" },
];

export function WalletConnectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const connect = useWalletStore((s) => s.connect);

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

  /* create wallet state */
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [createStep, setCreateStep] = useState<CreateStep>("generate");
  const [createNetwork, setCreateNetwork] = useState<WalletNetwork>("bsv");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  /* import wallet state */
  const [importInput, setImportInput] = useState("");
  const [importNetwork, setImportNetwork] = useState<WalletNetwork>("bsv");
  const [importStep, setImportStep] = useState<ImportStep>("enter");
  const [importError, setImportError] = useState<string | null>(null);
  const [importAddress, setImportAddress] = useState("");

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
  const [bsvManualAddr, setBsvManualAddr] = useState("");
  const [bsvManualWallet, setBsvManualWallet] = useState("");

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
      setConnecting(null);
      setConnected(null);
      setConnectError(null);
      setBsvStep("list");
      setBsvHandle("");
      setBsvHandleState("idle");
      setBsvHandleErr("");
      setBsvResolvedAddr("");
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
      connect({ address, provider: walletId, network: "sol" });
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
      connect({ address: accounts[0], provider: walletId, network: "evm", chainId });

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

  /* ── HandCash handle lookup ───────────────────────────────────────────── */
  const lookupHandCash = async () => {
    const handle = bsvHandle.trim().replace(/^\$/, "");
    if (!handle) return;
    setBsvHandleState("loading");
    setBsvHandleErr("");
    setBsvResolvedAddr("");
    try {
      const res = await fetch(`https://api.handcash.io/api/users/public-data?alias=${encodeURIComponent(handle)}`);
      if (!res.ok) throw new Error(`Handle not found (HTTP ${res.status}). Check the spelling.`);
      const data = await res.json();
      const addr: string =
        data?.publicProfile?.receivingAddress ??
        data?.publicProfile?.paymail ??
        `${handle}@handcash.io`;
      if (!addr) throw new Error("HandCash returned no address for that handle.");
      setBsvResolvedAddr(addr);
      setBsvHandleState("found");
    } catch (err: any) {
      setBsvHandleState("error");
      setBsvHandleErr(err?.message ?? "Handle not found. Check spelling or use your paymail instead.");
    }
  };

  /* ── Confirm BSV manual address ───────────────────────────────────────── */
  const confirmBsvManual = (walletId: string) => {
    const addr = bsvManualAddr.trim();
    if (!addr) return;
    connect({ address: addr, provider: walletId, network: "bsv" });
    goToPrep(addr, "bsv", walletId);
  };

  /* ── Dispatcher ─────────────────────────────────────────────────────────── */
  const handleConnect = (walletId: string, installUrl?: string) => {
    if (connectTab === "sol") return handleConnectSol(walletId);
    if (connectTab === "btc") return handleConnectBtc(walletId);
    if (connectTab === "bsv") return handleConnectBsv(walletId);
    return handleConnectEvm(walletId, installUrl);
  };

  /* ── Create wallet ────────────────────────────────────────────────────────── */
  const startCreate = (network: WalletNetwork) => {
    setCreateNetwork(network);
    setMnemonic(generateMnemonic(wordCount));
    setCreateStep("generate");
    setRevealed(false);
    setCopied(false);
    setConfirmed(false);
    setView("create");
  };

  const regenerate = () => { setMnemonic(generateMnemonic(wordCount)); setCopied(false); setRevealed(false); setConfirmed(false); };

  const handleCopy = () => {
    navigator.clipboard?.writeText(mnemonic.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const finishCreate = () => {
    const address = deriveAddress(mnemonic, createNetwork);
    connect({ address, provider: "aura-wallet", network: createNetwork });
    setCreateStep("done");
    setTimeout(() => goToPrep(address, createNetwork, "aura-wallet"), 1500);
  };

  /* ── Import wallet ────────────────────────────────────────────────────────── */
  const handleImport = () => {
    const result = validateMnemonic(importInput);
    if (!result.valid) { setImportError(result.error ?? "Invalid phrase"); return; }
    setImportError(null);
    const addr = deriveAddress(result.words, importNetwork);
    setImportAddress(addr);
    connect({ address: addr, provider: "aura-wallet", network: importNetwork });
    setImportStep("done");
    setTimeout(() => goToPrep(addr, importNetwork, "aura-wallet"), 1500);
  };

  const currentWallets = connectTab === "evm" ? EVM_WALLETS : connectTab === "sol" ? SOL_WALLETS : connectTab === "btc" ? BTC_WALLETS : BSV_WALLETS;

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
                      {view === "landing" && "Connect to OrahDEX"}
                      {view === "create" && "Create New Wallet"}
                      {view === "import" && "Import Wallet"}
                      {view === "connect" && "Connect Wallet"}
                      {view === "prep" && "Wallet Setup"}
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
                      className="p-5 space-y-4">

                      {/* ① BSV — primary featured block */}
                      <div className="rounded-2xl border border-green-500/35 bg-gradient-to-br from-green-500/8 via-transparent to-transparent p-5">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center text-2xl shrink-0">⚡</div>
                          <div>
                            <h3 className="font-black text-[15px] text-foreground leading-tight">Bitcoin SV Wallet</h3>
                            <p className="text-[11px] text-green-400 font-semibold">Primary settlement · sub-cent fees · instant finality</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <button
                            onClick={() => startCreate("bsv")}
                            className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md shadow-primary/20 active:scale-95 transition-transform"
                          >
                            <PlusCircle className="w-4 h-4" /> Create Wallet
                          </button>
                          <button
                            onClick={() => setView("import")}
                            className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-green-500/40 text-green-300 font-bold text-sm hover:bg-green-500/10 transition-colors"
                          >
                            <Download className="w-4 h-4" /> Import Seed
                          </button>
                        </div>
                        <button
                          onClick={() => { setConnectTab("bsv"); setView("connect"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border text-muted-foreground text-xs font-semibold hover:border-green-500/30 hover:text-foreground transition-all text-left"
                        >
                          <Link2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Connect existing BSV wallet <span className="opacity-60">(HandCash, RelayX, Panda…)</span></span>
                        </button>
                      </div>

                      {/* ② Multi-chain connect options */}
                      <div>
                        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-bold mb-2.5 px-0.5">Multi-chain wallets</p>
                        <div className="space-y-1.5">

                          {/* EVM */}
                          <button
                            onClick={() => { setConnectTab("evm"); setView("connect"); }}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-blue-500/40 hover:bg-blue-500/5 transition-all text-left"
                          >
                            <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-xl shrink-0">🌐</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-foreground">EVM Wallets</div>
                              <p className="text-[10px] text-muted-foreground truncate">MetaMask · Coinbase · Trust · OKX · Phantom + 7 more</p>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {["ETH","BNB","MATIC","ARB","OP","BASE","AVAX","FTM","CRO","LINEA","zkSync","Scroll","Mantle"].map(c => (
                                  <span key={c} className="text-[8px] font-bold px-1 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">{c}</span>
                                ))}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </button>

                          {/* Solana */}
                          <button
                            onClick={() => { setConnectTab("sol"); setView("connect"); }}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-violet-500/40 hover:bg-violet-500/5 transition-all text-left"
                          >
                            <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center text-xl shrink-0">◎</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-foreground">Solana Wallets</div>
                              <p className="text-[10px] text-muted-foreground">Phantom · Solflare · Backpack · Glow · Slope</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </button>

                          {/* Bitcoin */}
                          <button
                            onClick={() => { setConnectTab("btc"); setView("connect"); }}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-orange-500/40 hover:bg-orange-500/5 transition-all text-left"
                          >
                            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center text-xl shrink-0">₿</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-foreground">Bitcoin Wallets</div>
                              <p className="text-[10px] text-muted-foreground">Phantom · UniSat · Xverse · Leather · OYL — on-chain only, no Lightning</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </button>

                          {/* TRON info row */}
                          <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/40 bg-secondary/15">
                            <div className="w-10 h-10 rounded-xl bg-red-500/12 flex items-center justify-center text-xl shrink-0">🔴</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-foreground">TRON</span>
                                <span className="text-[8px] font-black px-1 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded">TVM</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground">TRX pairs listed · connect via manual BSV address entry</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ③ All supported chain badges */}
                      <div className="flex flex-wrap gap-1 px-0.5">
                        {["ETH","BNB","MATIC","ARB","OP","BASE","AVAX","FTM","CRO","LINEA","zkSync","Scroll","SOL","BTC","BSV","TRX"].map(c => (
                          <span key={c} className="text-[9px] font-bold px-1.5 py-0.5 bg-white/5 text-muted-foreground border border-border/60 rounded">{c}</span>
                        ))}
                      </div>

                      <div className="flex items-start gap-3 p-3.5 bg-primary/5 text-primary rounded-xl border border-primary/15">
                        <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                        <p className="text-xs leading-relaxed">
                          <span className="font-semibold">Non-custodial.</span>{" "}
                          OrahDEX never holds your keys. All trades settle directly on-chain via BSV — the fastest, highest-throughput settlement layer.
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
                              {(["bsv", "evm"] as WalletNetwork[]).map(n => (
                                <button key={n} onClick={() => setCreateNetwork(n)}
                                  className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                                    createNetwork === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
                                  )}>
                                  {n === "bsv" ? "⚡ Bitcoin SV" : "🌐 EVM / Web3"}
                                </button>
                              ))}
                            </div>
                          </div>

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

                          <button onClick={finishCreate} disabled={!confirmed || !revealed}
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
                          <h3 className="text-xl font-bold">Wallet Created!</h3>
                          <p className="text-sm text-muted-foreground text-center max-w-xs">
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
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Network</p>
                            <div className="flex gap-2">
                              {(["bsv", "evm"] as WalletNetwork[]).map(n => (
                                <button key={n} onClick={() => setImportNetwork(n)}
                                  className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                                    importNetwork === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
                                  )}>
                                  {n === "bsv" ? "⚡ Bitcoin SV" : "🌐 EVM / Web3"}
                                </button>
                              ))}
                            </div>
                          </div>

                          {importNetwork === "evm" && (
                            <>
                              <EvmChainSelector value={evmChain} onChange={setEvmChain} />
                              <AccountIndexSelector value={accountIndex} onChange={setAccountIndex} />
                            </>
                          )}

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Seed Phrase</p>
                              <span className="text-xs text-muted-foreground">{importInput.trim().split(/\s+/).filter(Boolean).length} words</span>
                            </div>
                            <textarea
                              value={importInput}
                              onChange={e => { setImportInput(e.target.value); setImportError(null); }}
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

                          <div className="flex gap-2">
                            {[12, 24].map(n => (
                              <span key={n} className="px-2.5 py-1 bg-white/5 border border-border text-muted-foreground text-xs rounded-full">{n} words</span>
                            ))}
                            <span className="text-xs text-muted-foreground self-center">BIP39 compatible</span>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-green-500/8 border border-green-500/20 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-green-300/80 leading-relaxed">
                              Never enter your seed phrase on untrusted sites. OrahDEX never stores or transmits your phrase — all derivation is local.
                            </p>
                          </div>

                          <button onClick={handleImport} disabled={importInput.trim().length === 0}
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
                          <h3 className="text-xl font-bold">Wallet Imported!</h3>
                          <p className="text-sm text-muted-foreground text-center max-w-xs">
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
                                  <p className="text-xs text-muted-foreground">Enter your $handle to look up your receiving address</p>
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
                                    }}
                                    onKeyDown={e => e.key === "Enter" && lookupHandCash()}
                                    placeholder="yourhandle"
                                    className="w-full bg-secondary/40 border border-border rounded-xl pl-8 pr-4 py-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-all"
                                  />
                                </div>
                              </div>

                              {bsvHandleState === "found" && bsvResolvedAddr && (
                                <div className="p-3.5 bg-green-500/10 border border-green-500/30 rounded-xl space-y-1">
                                  <p className="text-[11px] text-green-400 font-bold uppercase tracking-wider">Address found</p>
                                  <p className="text-xs font-mono text-foreground break-all">{bsvResolvedAddr}</p>
                                </div>
                              )}

                              {bsvHandleState === "error" && (
                                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                                  <p className="text-xs text-red-300 leading-relaxed">{bsvHandleErr}</p>
                                </div>
                              )}

                              {bsvHandleState !== "found" ? (
                                <button
                                  onClick={lookupHandCash}
                                  disabled={bsvHandleState === "loading" || !bsvHandle.trim()}
                                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                  {bsvHandleState === "loading" ? (
                                    <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Looking up...</span>
                                  ) : "Look Up $Handle"}
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    connect({ address: bsvResolvedAddr, provider: "handcash", network: "bsv" });
                                    goToPrep(bsvResolvedAddr, "bsv", "handcash");
                                  }}
                                  className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
                                >
                                  <CheckCircle2 className="w-4 h-4" /> Connect HandCash
                                </button>
                              )}

                              <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
                                Your address is resolved via the HandCash public API — OrahDEX never stores your handle.
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
                          {/* Network description */}
                          <div className="px-6 pt-3 pb-1">
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {connectTab === "evm" && "Connect any EVM-compatible wallet. Supports Ethereum, BNB Chain, Polygon, Arbitrum, Base, Optimism and all other EVM chains."}
                              {connectTab === "sol" && "Connect your Solana wallet. All SPL tokens and NFTs work on OrahDEX. BSV is used for cross-chain settlement."}
                              {connectTab === "btc" && "Connect your Bitcoin wallet — on-chain addresses only. Lightning Network is not accepted; use BSV for fast settlement."}
                              {connectTab === "bsv" && "Connect your Bitcoin SV wallet. BSV is the primary settlement layer for all OrahDEX trades — instant, on-chain, sub-cent fees."}
                            </p>
                          </div>

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
                        </>
                      )}

                      {/* BTC Lightning warning */}
                      {connectTab === "btc" && bsvStep === "list" && (
                        <div className="mx-6 mb-4 flex items-start gap-2.5 p-3 bg-green-500/8 border border-green-500/20 rounded-xl">
                          <AlertTriangle className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-green-300/80">
                            OrahDEX does not support Lightning Network. Use standard on-chain Bitcoin addresses (bc1q, 1, or 3). For fast settlement, use BSV.
                          </p>
                        </div>
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
                    </motion.div>
                  )}

                  {/* ── PREP (Wallet Setup) ── */}
                  {view === "prep" && (
                    <motion.div key="prep" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                      className="p-5 space-y-4">

                      {/* Connected badge */}
                      <div className="flex items-center gap-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-green-400 text-sm">Wallet Connected</p>
                          <p className="text-xs font-mono text-muted-foreground truncate">
                            {prepAddr.length > 22 ? `${prepAddr.slice(0, 10)}…${prepAddr.slice(-8)}` : prepAddr}
                          </p>
                          <span className="text-[9px] font-black uppercase tracking-wider text-green-400/70">
                            {prepNetwork} · {prepProvider}
                          </span>
                        </div>
                      </div>

                      {/* Step list */}
                      <div>
                        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-bold mb-2.5 px-0.5">Setup Checklist</p>
                        <div className="space-y-2.5">

                          {/* Step: Wallet Connected (always done) */}
                          <div className="flex items-center gap-3 p-3.5 rounded-xl border border-green-500/35 bg-green-500/5">
                            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                              <Check className="w-4 h-4 text-green-400" />
                            </div>
                            <div>
                              <p className="font-bold text-sm text-foreground">Wallet Connected</p>
                              <p className="text-[11px] text-muted-foreground">Your wallet is linked to OrahDEX</p>
                            </div>
                          </div>

                          {/* Step: Fund */}
                          <div className={`rounded-xl border transition-all ${prepStep === "fund" ? "border-primary/60 bg-primary/8 p-4" : "border-green-500/35 bg-green-500/5 p-3.5"}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${prepStep === "fund" ? "bg-primary/20" : "bg-green-500/20"}`}>
                                {prepStep === "fund"
                                  ? <span className="text-sm font-black text-primary">2</span>
                                  : <Check className="w-4 h-4 text-green-400" />}
                              </div>
                              <div className="flex-1">
                                <p className="font-bold text-sm text-foreground">Fund Your Wallet</p>
                                <p className="text-[11px] text-muted-foreground">
                                  Deposit {prepNetwork === "bsv" ? "BSV" : prepNetwork === "evm" ? "ETH or tokens" : prepNetwork === "sol" ? "SOL" : "BTC"} to start trading
                                </p>
                              </div>
                            </div>
                            {prepStep === "fund" && (
                              <div className="mt-3 space-y-2">
                                <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2.5">
                                  <span className="flex-1 font-mono text-[11px] text-foreground break-all leading-relaxed">{prepAddr}</span>
                                  <button
                                    onClick={() => navigator.clipboard?.writeText(prepAddr)}
                                    className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <button
                                  onClick={() => setPrepStep("approve")}
                                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
                                >
                                  I've funded my wallet →
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Step: Enable Trading */}
                          <div className={`rounded-xl border transition-all ${prepStep === "approve" ? "border-primary/60 bg-primary/8 p-4" : prepStep === "done" ? "border-green-500/35 bg-green-500/5 p-3.5" : "border-border opacity-50 p-3.5"}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${prepStep === "approve" ? "bg-primary/20" : prepStep === "done" ? "bg-green-500/20" : "bg-secondary/60"}`}>
                                {prepStep === "done"
                                  ? <Check className="w-4 h-4 text-green-400" />
                                  : <span className={`text-sm font-black ${prepStep === "approve" ? "text-primary" : "text-muted-foreground"}`}>3</span>}
                              </div>
                              <div>
                                <p className="font-bold text-sm text-foreground">Enable Trading</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {prepNetwork === "evm" ? "Approve token allowances in your wallet" : "Confirm wallet is ready for DEX swaps"}
                                </p>
                              </div>
                            </div>
                            {prepStep === "approve" && (
                              <div className="mt-3 space-y-2">
                                <div className="p-3 bg-blue-500/8 border border-blue-500/20 rounded-lg">
                                  <p className="text-[11px] text-blue-300/90 leading-relaxed">
                                    {prepNetwork === "evm"
                                      ? "To trade ERC-20 tokens you'll need to approve allowances for each token in your wallet app. ETH trades require no approval."
                                      : prepNetwork === "bsv"
                                      ? "Your BSV wallet is ready for OrahDEX — no extra approvals needed. BSV is the native settlement currency."
                                      : prepNetwork === "sol"
                                      ? "Solana SPL tokens don't require separate approval steps. You're good to go."
                                      : "Bitcoin trades use standard UTXO signing. Your wallet will prompt for each swap."}
                                  </p>
                                </div>
                                <button
                                  onClick={() => setPrepStep("done")}
                                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
                                >
                                  {prepNetwork === "evm" ? "Got it — I'll approve in my wallet" : "All set →"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Done state */}
                      {prepStep === "done" && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                            <div>
                              <p className="font-bold text-green-400">All set! Your wallet is ready.</p>
                              <p className="text-xs text-muted-foreground">Start trading on OrahDEX now.</p>
                            </div>
                          </div>
                          <button
                            onClick={handleClose}
                            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base shadow-lg shadow-primary/25"
                          >
                            Start Trading →
                          </button>
                        </div>
                      )}

                      {/* Skip */}
                      {prepStep !== "done" && (
                        <button
                          onClick={handleClose}
                          className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 transition-colors"
                        >
                          Skip setup — go straight to trading
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
