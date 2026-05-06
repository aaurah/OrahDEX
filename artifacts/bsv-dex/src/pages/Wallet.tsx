import { useEffect, useMemo, useState } from "react";
import {
  Wallet as WalletIcon, Download, ArrowDownUp, Copy, Check,
  ShieldCheck, KeyRound, Plus, ChevronRight, AlertCircle, Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { getImportedWallet, getDerivedAddresses, type DerivedAddresses } from "@/lib/walletPin";
import { listPasskeyWallets } from "@/lib/passkeyWallet";
import { ReceiveModal } from "@/components/ReceiveModal";
import { RevealSecretSheet } from "@/components/wallet/RevealSecretSheet";
import { ChainReceiveSheet } from "@/components/wallet/ChainReceiveSheet";
import { BrandLogo } from "@/components/BrandLogo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSettingsStore, formatQuoteAmount } from "@/store/useSettingsStore";

/** Sums balances across all 8 live EVM chains for a given address.
 *  Each chain is a static hook call — rules of hooks are satisfied. */
function useAllEvmBalances(address: string | null) {
  const c1    = useEvmBalances(address, 1);
  const c56   = useEvmBalances(address, 56);
  const c137  = useEvmBalances(address, 137);
  const c42161= useEvmBalances(address, 42161);
  const c10   = useEvmBalances(address, 10);
  const c8453 = useEvmBalances(address, 8453);
  const c43114= useEvmBalances(address, 43114);
  const c59144= useEvmBalances(address, 59144);

  const all = [c1, c56, c137, c42161, c10, c8453, c43114, c59144];
  const totalUsd = all.reduce((sum, { balances }) =>
    sum + balances.reduce((s, b) => s + (b.usdValue ?? 0), 0), 0);
  return totalUsd;
}

/** Chain catalogue — what an imToken / Guarda style wallet exposes.
 *  `live: true` chains have working balance + send today.
 *  `live: false` are derived addresses we'll wire up in subsequent phases
 *  (BTC/BCH in Phase 2, Tron in Phase 3, Solana in Phase 4, Ledger in Phase 6). */
type ChainRow = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  family: "evm" | "bsv" | "btc" | "bch" | "tron" | "solana" | "xrp" | "ltc" | "doge";
  evmChainId?: number;
  live: boolean;
  badge?: string;
};

const CHAINS: ChainRow[] = [
  // EVM (live)
  { id: "eth",    name: "Ethereum",   symbol: "ETH",   color: "#627EEA", family: "evm", evmChainId: 1,     live: true },
  { id: "bnb",    name: "BNB Chain",  symbol: "BNB",   color: "#F3BA2F", family: "evm", evmChainId: 56,    live: true },
  { id: "polygon",name: "Polygon",    symbol: "MATIC", color: "#8247E5", family: "evm", evmChainId: 137,   live: true },
  { id: "arb",    name: "Arbitrum",   symbol: "ETH",   color: "#28A0F0", family: "evm", evmChainId: 42161, live: true },
  { id: "op",     name: "Optimism",   symbol: "ETH",   color: "#FF0420", family: "evm", evmChainId: 10,    live: true },
  { id: "base",   name: "Base",       symbol: "ETH",   color: "#0052FF", family: "evm", evmChainId: 8453,  live: true },
  { id: "avax",   name: "Avalanche",  symbol: "AVAX",  color: "#E84142", family: "evm", evmChainId: 43114, live: true },
  { id: "linea",  name: "Linea",      symbol: "ETH",   color: "#121212", family: "evm", evmChainId: 59144, live: true },
  // BSV (live)
  { id: "bsv",    name: "Bitcoin SV", symbol: "BSV",   color: "#EAB300", family: "bsv", live: true },
  // Derived from the same seed (BIP44) — receive works today, send via Phase 3+
  { id: "btc",    name: "Bitcoin",      symbol: "BTC", color: "#F7931A", family: "btc",    live: true },
  { id: "bch",    name: "Bitcoin Cash", symbol: "BCH", color: "#0AC18E", family: "bch",    live: true },
  { id: "sol",    name: "Solana",       symbol: "SOL", color: "#14F195", family: "solana", live: true },
  { id: "tron",   name: "Tron",         symbol: "TRX",  color: "#FF060A", family: "tron",   live: true },
  { id: "xrp",   name: "XRP Ledger",   symbol: "XRP",  color: "#00AAE4", family: "xrp",    live: true },
  { id: "ltc",   name: "Litecoin",     symbol: "LTC",  color: "#A6A9AA", family: "ltc",    live: true },
  { id: "doge",  name: "Dogecoin",     symbol: "DOGE", color: "#C2A633", family: "doge",   live: true },
];

function shortAddr(a: string | null) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Returns the on-chain address for the given chain.
 *
 *  Critical: never fall back to the EVM address for non-EVM chains — handing
 *  back a 0x… address as a BSV/BTC/BCH deposit address would route real funds
 *  to a wrong-format address and lose them. We only return the connected
 *  address when it actually belongs to the same chain family. */
function addressForChain(
  chain: ChainRow,
  evmAddress: string | null,
  connectedNetwork: string | null,
  derived: DerivedAddresses | null,
): string | null {
  if (chain.family === "evm") return evmAddress;
  if (chain.family === "bsv") {
    if (derived?.bsv) return derived.bsv;
    // Only use the connected address when the wallet itself is a native BSV wallet
    if (connectedNetwork === "bsv" && evmAddress) return evmAddress;
    return null;
  }
  if (chain.family === "btc")    return derived?.btc  ?? null;
  if (chain.family === "bch")    return derived?.bch  ?? null;
  if (chain.family === "solana") return derived?.sol  ?? null;
  if (chain.family === "tron")   return derived?.tron ?? null;
  if (chain.family === "xrp")    return derived?.xrp  ?? null;
  if (chain.family === "ltc")    return derived?.ltc  ?? null;
  if (chain.family === "doge")   return derived?.doge ?? null;
  return null;
}

function ChainBalanceRow({
  chain, address, network, derived, onReceive,
}: {
  chain: ChainRow;
  address: string | null;
  network: string | null;
  derived: DerivedAddresses | null;
  onReceive: (chain: ChainRow) => void;
}) {
  // Live EVM balance fetch (only for live EVM chains, only when address present)
  const useEvm = chain.family === "evm" && chain.live && !!address;
  const { balances } = useEvmBalances(
    useEvm ? address : null,
    useEvm ? (chain.evmChainId ?? null) : null,
  );

  const native = balances.find(b => b.isNative);
  const nativeAmt = native?.amount ?? 0;
  const tokenCount = balances.filter(b => !b.isNative && b.amount > 0).length;
  const subtotalUsd = balances.reduce((s, b) => s + (b.usdValue ?? 0), 0);

  const chainAddr   = addressForChain(chain, address, network, derived);
  const canReceive  = !!chainAddr && chain.live;

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow"
        style={{ backgroundColor: chain.color }}
      >
        {chain.symbol.slice(0, 3)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{chain.name}</p>
          {chain.badge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase tracking-wider">
              {chain.badge}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
          {useEvm
            ? `${nativeAmt.toFixed(4)} ${chain.symbol}${tokenCount ? ` · ${tokenCount} tokens` : ""}`
            : chainAddr
              ? `${chainAddr.slice(0, 12)}…${chainAddr.slice(-6)}`
              : (chain.live ? "Sign in to derive your address" : "Coming in this release")}
        </p>
      </div>
      {chain.live && useEvm && (
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-foreground">${subtotalUsd.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">{tokenCount + 1} assets</p>
        </div>
      )}
      <div className="flex gap-1 shrink-0 ml-2">
        <button
          onClick={() => onReceive(chain)}
          disabled={!canReceive}
          className="w-8 h-8 rounded-lg bg-secondary/60 hover:bg-secondary disabled:opacity-30 flex items-center justify-center"
          title="Receive"
        >
          <Download size={14} />
        </button>
      </div>
    </div>
  );
}

export default function Wallet() {
  const { address, network } = useWalletStore();
  const openWalletModal   = useWalletModalStore(s => s.open);
  const [, navigate]      = useLocation();
  const { toast }         = useToast();

  const imported = useMemo(() => (address ? getImportedWallet(address) : null), [address]);
  const passkeyOwned = useMemo(
    () => (address ? listPasskeyWallets().some(w => w.address.toLowerCase() === address.toLowerCase()) : false),
    [address],
  );
  // Backup is offered for any sovereign wallet — both PIN/passkey-imported AND native passkey-created.
  const canBackup = !!imported || passkeyOwned;
  const [derived, setDerived] = useState<DerivedAddresses | null>(() => getDerivedAddresses(address));
  useEffect(() => { setDerived(getDerivedAddresses(address)); }, [address]);

  const { quoteCurrency } = useSettingsStore();
  const totalUsd = useAllEvmBalances(address);

  const [receiveOpen, setReceiveOpen]       = useState(false);
  const [chainReceive, setChainReceive]     = useState<{ open: boolean; chain?: ChainRow; address?: string | null }>({ open: false });
  const [revealOpen, setRevealOpen]         = useState(false);
  const [copied, setCopied]                 = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: "Address copied" });
  };

  if (!address) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-20">
        <div className="w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center mb-5">
          <WalletIcon size={32} className="text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Your sovereign wallet</h2>
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
          Import a seed phrase, create a passkey wallet, or connect an external wallet —
          all chains, one identity.
        </p>
        <button
          onClick={() => openWalletModal()}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2"
        >
          <Plus size={16} /> Get started
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full px-3 sm:px-6 py-4 sm:py-6 max-w-3xl mx-auto pb-32 sm:pb-10">

      {/* ── Identity card ── */}
      <div className="rounded-3xl bg-gradient-to-br from-primary/15 via-card to-card border border-border p-5 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BrandLogo textSize="text-lg" suffix="Wallet" />
          </div>
          {imported && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-primary/15 text-primary uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck size={10} /> {imported.protectedBy === "passkey" ? "Passkey" : "PIN"} secured
            </span>
          )}
        </div>

        {/* Total balance */}
        <div className="mb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Total balance</p>
          <p className="text-3xl font-bold text-foreground tracking-tight">
            {formatQuoteAmount(totalUsd, quoteCurrency)}
          </p>
        </div>

        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Your address</p>
        <button
          onClick={copyAddress}
          className="flex items-center gap-2 group w-full text-left"
        >
          <span className="font-mono text-sm sm:text-base text-foreground truncate">{shortAddr(address)}</span>
          {copied
            ? <Check size={14} className="text-green-400" />
            : <Copy size={14} className="text-muted-foreground group-hover:text-foreground" />}
        </button>

        <div className="grid grid-cols-3 gap-2 mt-5">
          <ActionButton icon={Download}   label="Receive" onClick={() => setReceiveOpen(true)} />
          <ActionButton icon={ArrowDownUp} label="Swap"   onClick={() => navigate("/swap")} />
          <ActionButton icon={Sparkles}   label="Buy"     onClick={() => navigate("/swap")} />
        </div>
      </div>

      {/* ── Backup CTA (any sovereign wallet — imported or native passkey) ── */}
      {canBackup && (
        <button
          onClick={() => setRevealOpen(true)}
          className="w-full mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3 hover:bg-amber-500/15 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
            <KeyRound size={18} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Back up your wallet</p>
            <p className="text-[11px] text-muted-foreground">Reveal recovery phrase or private key. Authentication required.</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      )}

      {!canBackup && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            You're connected via an external wallet (WalletConnect). Backup is managed by that wallet's own app.
          </p>
        </div>
      )}

      {/* ── All chains ── */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1 mb-2">
          Chains
        </p>
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {CHAINS.map(c => (
            <ChainBalanceRow
              key={c.id}
              chain={c}
              address={address}
              network={network}
              derived={derived}
              onReceive={(chain) => {
                if (chain.family === "evm") {
                  setReceiveOpen(true);
                } else {
                  setChainReceive({ open: true, chain, address: addressForChain(chain, address, network, derived) });
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* ── History link ── */}
      <button
        onClick={() => navigate("/portfolio")}
        className="w-full mt-4 rounded-2xl border border-border bg-card p-4 flex items-center justify-between hover:bg-secondary/30"
      >
        <span className="text-sm font-medium text-foreground">Transaction history</span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </button>

      {/* ── Modals ── */}
      <ReceiveModal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <ChainReceiveSheet
        open={chainReceive.open}
        onClose={() => setChainReceive({ open: false })}
        chainName={chainReceive.chain?.name ?? ""}
        symbol={chainReceive.chain?.symbol ?? ""}
        address={chainReceive.address ?? null}
        hint={canBackup ? undefined : "Connect a sovereign Orah wallet (passkey or seed phrase) to derive an on-chain address for this network."}
      />
      <RevealSecretSheet open={revealOpen} onClose={() => setRevealOpen(false)} address={address} />
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-card border border-border hover:bg-secondary/40 active:scale-95 transition-all"
    >
      <Icon size={18} className="text-primary" />
      <span className="text-[11px] font-semibold text-foreground">{label}</span>
    </button>
  );
}
