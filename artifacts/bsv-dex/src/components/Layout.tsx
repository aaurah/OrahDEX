import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Wallet, LogOut, LayoutDashboard, LineChart, ArrowRightLeft, Menu, X, Sun, Moon, Monitor, Smartphone, Layers, Users, ChevronDown, Check, RefreshCw } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { WalletConnectModal } from "./WalletConnectModal";
import { shortenAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";

const THEME_ICONS = { dark: Moon, light: Sun, amoled: Smartphone, system: Monitor };
const THEME_CYCLE = ["dark", "light", "amoled", "system"] as const;
const THEME_LABELS = { dark: "Dark", light: "Light", amoled: "Amoled", system: "System" };

const NAV_LINKS = [
  { href: "/", label: "Markets", icon: Activity },
  { href: "/trade/BSV-USDT", label: "Spot", icon: ArrowRightLeft },
  { href: "/futures/BSV-USDT-PERP", label: "Futures", icon: LineChart },
  { href: "/dex", label: "Market Hub", icon: Layers },
  { href: "/p2p", label: "P2P", icon: Users },
  { href: "/portfolio", label: "Portfolio", icon: LayoutDashboard },
];

const CHAIN_META: Record<number, { short: string; name: string; color: string; hex: string }> = {
  1:     { short: "ETH",   name: "Ethereum",      color: "bg-blue-500/20 text-blue-400 border-blue-500/30",     hex: "0x1" },
  56:    { short: "BNB",   name: "BNB Chain",     color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", hex: "0x38" },
  137:   { short: "MATIC", name: "Polygon",        color: "bg-violet-500/20 text-violet-400 border-violet-500/30", hex: "0x89" },
  42161: { short: "ARB",   name: "Arbitrum One",   color: "bg-sky-500/20 text-sky-400 border-sky-500/30",         hex: "0xa4b1" },
  10:    { short: "OP",    name: "Optimism",       color: "bg-red-500/20 text-red-400 border-red-500/30",         hex: "0xa" },
  8453:  { short: "BASE",  name: "Base",           color: "bg-blue-600/20 text-blue-300 border-blue-600/30",      hex: "0x2105" },
  324:   { short: "ZK",    name: "zkSync Era",     color: "bg-purple-500/20 text-purple-400 border-purple-500/30", hex: "0x144" },
};

const SWITCHABLE_CHAINS = [1, 56, 137, 42161, 10, 8453, 324];

function ChainSwitcher({ chainId }: { chainId: number | null }) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { address, provider } = useWalletStore();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const meta = chainId ? CHAIN_META[chainId] : null;
  const label = meta?.short ?? (chainId ? `#${chainId}` : "EVM");
  const color = meta?.color ?? "bg-blue-500/20 text-blue-400 border-blue-500/30";

  const switchTo = async (targetChainId: number) => {
    setOpen(false);
    if (targetChainId === chainId) return;
    const target = CHAIN_META[targetChainId];
    if (!target) return;
    const eth = (window as any).ethereum;
    if (!eth) return;
    setSwitching(true);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target.hex }] });
      if (address && provider) {
        useWalletStore.getState().connect({ address, provider, network: "evm", chainId: targetChainId });
      }
    } catch (err: any) {
      if (err?.code === 4902) {
        const CHAIN_RPC: Record<number, object> = {
          56:    { chainId: "0x38",   chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB",   symbol: "BNB",   decimals: 18 }, rpcUrls: ["https://bsc-dataseed.binance.org/"],       blockExplorerUrls: ["https://bscscan.com"] },
          137:   { chainId: "0x89",   chainName: "Polygon",          nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 }, rpcUrls: ["https://polygon-rpc.com/"],                 blockExplorerUrls: ["https://polygonscan.com"] },
          42161: { chainId: "0xa4b1", chainName: "Arbitrum One",     nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, rpcUrls: ["https://arb1.arbitrum.io/rpc"],             blockExplorerUrls: ["https://arbiscan.io"] },
          10:    { chainId: "0xa",    chainName: "Optimism",          nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, rpcUrls: ["https://mainnet.optimism.io"],              blockExplorerUrls: ["https://optimistic.etherscan.io"] },
          8453:  { chainId: "0x2105", chainName: "Base",              nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, rpcUrls: ["https://mainnet.base.org"],                 blockExplorerUrls: ["https://basescan.org"] },
          324:   { chainId: "0x144",  chainName: "zkSync Era",        nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, rpcUrls: ["https://mainnet.era.zksync.io"],            blockExplorerUrls: ["https://explorer.zksync.io"] },
        };
        const params = CHAIN_RPC[targetChainId];
        if (params) await eth.request({ method: "wallet_addEthereumChain", params: [params] });
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider transition-colors hover:opacity-80",
          color
        )}
        title="Switch network"
      >
        {switching ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : label}
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-44 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden py-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold px-3 py-1.5">Switch Network</p>
          {SWITCHABLE_CHAINS.map(cid => {
            const c = CHAIN_META[cid];
            const active = cid === chainId;
            return (
              <button
                key={cid}
                onClick={() => switchTo(cid)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors text-left",
                  active ? "text-primary bg-primary/8" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                <span className={cn("text-[9px] font-black px-1 py-0.5 rounded border", c.color)}>{c.short}</span>
                <span className="flex-1">{c.name}</span>
                {active && <Check className="w-3 h-3 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { address, provider, network, chainId, disconnect } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
  const { isOpen: isWalletModalOpen, open: openWalletModal, close: closeWalletModal } = useWalletModalStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const safeTheme = (THEME_CYCLE as readonly string[]).includes(theme) ? (theme as typeof THEME_CYCLE[number]) : "dark";
  const ThemeIcon = THEME_ICONS[safeTheme];
  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(safeTheme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <header className="sticky top-0 h-16 border-b border-border bg-card/95 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 shrink-0 z-40">
        <div className="flex items-center gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 via-primary to-orange-400 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
              <span className="text-white font-black text-base leading-none select-none" style={{ fontFamily: "Inter, sans-serif" }}>O</span>
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-extrabold text-lg tracking-tight text-foreground">
                Orah<span className="text-primary">DEX</span>
              </span>
              <span className="text-[9px] text-muted-foreground tracking-widest uppercase font-medium">Trade means DEX</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = link.href === "/"
                ? location === "/"
                : location.startsWith("/" + link.href.split("/")[1]);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors text-xs font-medium"
            title={`Switch theme — currently ${THEME_LABELS[safeTheme]}`}
          >
            <ThemeIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{THEME_LABELS[safeTheme]}</span>
          </button>

          {address ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-1.5">
                  {network === "evm" ? (
                    <ChainSwitcher chainId={chainId} />
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider bg-amber-500/20 text-amber-400 border-amber-500/30">
                      BSV
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground capitalize">{provider}</span>
                </div>
                <span className="text-sm font-mono text-foreground bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                  {shortenAddress(address)}
                </span>
              </div>
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Connected" />
              <button
                onClick={disconnect}
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                title="Disconnect Wallet"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => openWalletModal()}
              className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30 active:scale-95 transition-all"
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )}

          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-card border-b border-border z-30 shadow-xl">
          <nav className="flex flex-col p-4 gap-2">
            {NAV_LINKS.map((link) => {
              const isActive = link.href === "/" ? location === "/" : location.startsWith("/" + link.href.split("/")[1]);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl font-medium",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <link.icon className="w-5 h-5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {!address && (
            <div className="px-4 pb-4">
              <button
                onClick={() => { openWalletModal(); setIsMobileMenuOpen(false); }}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-5 py-3 rounded-xl font-semibold shadow-lg"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </button>
            </div>
          )}
        </div>
      )}

      <main className="flex-1 relative z-0">
        {children}
      </main>

      <WalletConnectModal
        isOpen={isWalletModalOpen}
        onClose={closeWalletModal}
      />
    </div>
  );
}
