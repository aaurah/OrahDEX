/**
 * WalletAddresses — Hardware-wallet-style address manager.
 * Shows every derived chain address with derivation path, full address,
 * copy, QR code, explorer link — identical feel to Ledger Live / Keystone.
 */
import { useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy, Check, ExternalLink, ChevronDown, ChevronUp,
  Shield, Cpu, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { DerivedAddresses } from "@/lib/walletPin";

// ── Chain derivation metadata ─────────────────────────────────────────────────

interface ChainMeta {
  id: string;
  name: string;
  symbol: string;
  color: string;
  family: string;
  derivationPath: string;
  slip44: number;
  standard: string;
  group: "evm" | "utxo" | "l1";
  explorerPrefix: string;
}

const CHAIN_META: ChainMeta[] = [
  // ── EVM ──────────────────────────────────────────────────────────────────
  { id: "eth",     name: "Ethereum",      symbol: "ETH",  color: "#627EEA", family: "evm", derivationPath: "m/44'/60'/0'/0/0", slip44: 60,  standard: "BIP44",    group: "evm",  explorerPrefix: "https://etherscan.io/address/" },
  { id: "bnb",     name: "BNB Chain",     symbol: "BNB",  color: "#F3BA2F", family: "evm", derivationPath: "m/44'/60'/0'/0/0", slip44: 60,  standard: "BIP44",    group: "evm",  explorerPrefix: "https://bscscan.com/address/" },
  { id: "polygon", name: "Polygon",       symbol: "MATIC",color: "#8247E5", family: "evm", derivationPath: "m/44'/60'/0'/0/0", slip44: 60,  standard: "BIP44",    group: "evm",  explorerPrefix: "https://polygonscan.com/address/" },
  { id: "arb",     name: "Arbitrum",      symbol: "ETH",  color: "#28A0F0", family: "evm", derivationPath: "m/44'/60'/0'/0/0", slip44: 60,  standard: "BIP44",    group: "evm",  explorerPrefix: "https://arbiscan.io/address/" },
  { id: "op",      name: "Optimism",      symbol: "ETH",  color: "#FF0420", family: "evm", derivationPath: "m/44'/60'/0'/0/0", slip44: 60,  standard: "BIP44",    group: "evm",  explorerPrefix: "https://optimistic.etherscan.io/address/" },
  { id: "base",    name: "Base",          symbol: "ETH",  color: "#0052FF", family: "evm", derivationPath: "m/44'/60'/0'/0/0", slip44: 60,  standard: "BIP44",    group: "evm",  explorerPrefix: "https://basescan.org/address/" },
  { id: "avax",    name: "Avalanche",     symbol: "AVAX", color: "#E84142", family: "evm", derivationPath: "m/44'/60'/0'/0/0", slip44: 60,  standard: "BIP44",    group: "evm",  explorerPrefix: "https://snowtrace.io/address/" },
  { id: "linea",   name: "Linea",         symbol: "ETH",  color: "#61DFFF", family: "evm", derivationPath: "m/44'/60'/0'/0/0", slip44: 60,  standard: "BIP44",    group: "evm",  explorerPrefix: "https://lineascan.build/address/" },
  // ── UTXO ─────────────────────────────────────────────────────────────────
  { id: "bsv",     name: "Bitcoin SV",    symbol: "BSV",  color: "#EAB300", family: "bsv", derivationPath: "m/44'/236'/0'/0/0",slip44: 236, standard: "BIP44",    group: "utxo", explorerPrefix: "https://whatsonchain.com/address/" },
  { id: "btc",     name: "Bitcoin",       symbol: "BTC",  color: "#F7931A", family: "btc", derivationPath: "m/44'/0'/0'/0/0",  slip44: 0,   standard: "BIP44",    group: "utxo", explorerPrefix: "https://mempool.space/address/" },
  { id: "bch",     name: "Bitcoin Cash",  symbol: "BCH",  color: "#0AC18E", family: "bch", derivationPath: "m/44'/145'/0'/0/0",slip44: 145, standard: "BIP44",    group: "utxo", explorerPrefix: "https://explorer.bitcoin.com/bch/address/" },
  { id: "ltc",     name: "Litecoin",      symbol: "LTC",  color: "#A6A9AA", family: "ltc", derivationPath: "m/44'/2'/0'/0/0",  slip44: 2,   standard: "BIP44",    group: "utxo", explorerPrefix: "https://litecoinspace.org/address/" },
  { id: "doge",    name: "Dogecoin",      symbol: "DOGE", color: "#C2A633", family: "doge",derivationPath: "m/44'/3'/0'/0/0",  slip44: 3,   standard: "BIP44",    group: "utxo", explorerPrefix: "https://dogechain.info/address/" },
  // ── L1 ───────────────────────────────────────────────────────────────────
  { id: "sol",     name: "Solana",        symbol: "SOL",  color: "#14F195", family: "solana",derivationPath: "m/44'/501'/0'/0'", slip44: 501, standard: "SLIP-0010",group: "l1",   explorerPrefix: "https://solscan.io/account/" },
  { id: "tron",    name: "Tron",          symbol: "TRX",  color: "#FF060A", family: "tron", derivationPath: "m/44'/195'/0'/0/0",slip44: 195, standard: "BIP44",    group: "l1",   explorerPrefix: "https://tronscan.org/#/address/" },
  { id: "xrp",     name: "XRP Ledger",    symbol: "XRP",  color: "#00AAE4", family: "xrp",  derivationPath: "m/44'/144'/0'/0/0",slip44: 144, standard: "BIP44",    group: "l1",   explorerPrefix: "https://xrpscan.com/account/" },
];

const GROUP_LABEL: Record<string, string> = {
  evm:  "EVM Networks  (same address, all chains)",
  utxo: "UTXO Chains",
  l1:   "Other L1s",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAddress(
  meta: ChainMeta,
  evmAddress: string | null,
  bsvAddress: string | null,
  network: string | null,
  derived: DerivedAddresses | null,
): string | null {
  if (meta.family === "evm")    return evmAddress;
  if (meta.family === "bsv")    return derived?.bsv ?? (network === "bsv" ? bsvAddress : null);
  if (meta.family === "btc")    return derived?.btc  ?? null;
  if (meta.family === "bch")    return derived?.bch  ?? null;
  if (meta.family === "solana") return derived?.sol  ?? null;
  if (meta.family === "tron")   return derived?.tron ?? null;
  if (meta.family === "xrp")    return derived?.xrp  ?? null;
  if (meta.family === "ltc")    return derived?.ltc  ?? null;
  if (meta.family === "doge")   return derived?.doge ?? null;
  return null;
}

// ── Single address card ───────────────────────────────────────────────────────

function AddressCard({
  meta, addr, masked,
}: {
  meta: ChainMeta;
  addr: string | null;
  masked: boolean;
}) {
  const { toast } = useToast();
  const [copied, setCopied]     = useState(false);
  const [qrOpen, setQrOpen]     = useState(false);

  const copy = useCallback(async () => {
    if (!addr) return;
    await navigator.clipboard.writeText(addr);
    setCopied(true);
    toast({ title: `${meta.name} address copied` });
    setTimeout(() => setCopied(false), 1800);
  }, [addr, meta.name, toast]);

  const displayAddr = !addr
    ? "Not linked"
    : masked
      ? `${addr.slice(0, 6)}${"•".repeat(Math.max(0, addr.length - 10))}${addr.slice(-4)}`
      : addr;

  return (
    <div className={cn(
      "p-3.5 border-b border-[var(--color-border)] last:border-b-0 transition-colors",
      addr ? "bg-[var(--color-surface)]" : "bg-[var(--color-bg)] opacity-60",
    )}>
      <div className="flex items-center gap-3">
        {/* Chain logo */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-[10px] shrink-0 shadow-sm"
          style={{ backgroundColor: meta.color }}
        >
          {meta.symbol.slice(0, 3)}
        </div>

        {/* Name + derivation */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-[var(--color-text)]">{meta.name}</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)]">
              {meta.derivationPath}
            </span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase">
              {meta.standard}
            </span>
          </div>

          {/* Full address */}
          <p className={cn(
            "text-[11px] font-mono mt-0.5 break-all leading-tight",
            addr ? "text-[var(--color-text)]" : "text-[var(--color-text-secondary)] italic",
          )}>
            {displayAddr}
          </p>
        </div>

        {/* Actions */}
        {addr && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={copy}
              title="Copy address"
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-blue-500/40 hover:bg-blue-500/8 transition-all"
            >
              {copied
                ? <Check size={12} className="text-green-400" />
                : <Copy size={12} className="text-[var(--color-text-secondary)]" />}
            </button>

            <button
              onClick={() => setQrOpen(o => !o)}
              title={qrOpen ? "Hide QR" : "Show QR"}
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center border transition-all",
                qrOpen
                  ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                  : "bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-blue-500/40"
              )}
            >
              {qrOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            <a
              href={meta.explorerPrefix + addr}
              target="_blank"
              rel="noopener noreferrer"
              title="View on explorer"
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-blue-500/40 hover:bg-blue-500/8 text-[var(--color-text-secondary)] hover:text-blue-400 transition-all"
            >
              <ExternalLink size={11} />
            </a>
          </div>
        )}
      </div>

      {/* QR code panel */}
      {qrOpen && addr && (
        <div className="mt-3 flex flex-col items-center gap-2 pt-3 border-t border-[var(--color-border)]">
          <div className="p-3 bg-white rounded-xl shadow-sm">
            <QRCodeSVG
              value={addr}
              size={160}
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="text-[10px] font-mono text-[var(--color-text-secondary)] text-center break-all max-w-xs">
            {addr}
          </p>
          <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)]">
            <Shield size={10} className="text-green-400" />
            <span>Verify on a trusted device before sending funds</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WalletAddresses({
  evmAddress,
  bsvAddress,
  network,
  derived,
  onRefresh,
  refreshing,
}: {
  evmAddress: string | null;
  bsvAddress: string | null;
  network: string | null;
  derived: DerivedAddresses | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [masked, setMasked] = useState(false);

  const linkedCount = CHAIN_META.filter(m =>
    !!getAddress(m, evmAddress, bsvAddress, network, derived),
  ).length;

  const groups: Array<"evm" | "utxo" | "l1"> = ["evm", "utxo", "l1"];

  return (
    <div className="space-y-4">

      {/* Header bar */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-1.5">
            <Cpu size={16} className="text-blue-400" />
            All Addresses
          </h2>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            {linkedCount} of {CHAIN_META.length} chains linked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMasked(m => !m)}
            title={masked ? "Show addresses" : "Mask addresses"}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-blue-500/40 transition-all text-[var(--color-text-secondary)]"
          >
            {masked ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Re-derive all addresses from passkey"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold transition-all disabled:opacity-50"
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Groups */}
      {groups.map(group => {
        const chains = CHAIN_META.filter(m => m.group === group);
        // For EVM we only show ONE card (all use same address)
        const displayed = group === "evm"
          ? [
              ...chains.filter(m => m.id === "eth"),
              { ...chains[0], id: "__evm_note__" } as ChainMeta,
            ].filter(m => m.id === "eth")
          : chains;

        return (
          <div key={group}>
            <p className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-widest mb-1.5 px-1">
              {GROUP_LABEL[group]}
            </p>
            <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden">
              {group === "evm" ? (
                <>
                  {/* EVM: show one shared card + all chain names */}
                  <div className="p-3.5 bg-[var(--color-surface)]">
                    <div className="flex items-start gap-3">
                      <div className="flex -space-x-1.5 shrink-0 mt-0.5">
                        {chains.slice(0, 5).map(m => (
                          <div
                            key={m.id}
                            className="w-5 h-5 rounded-full border border-[var(--color-bg)] flex items-center justify-center text-white font-black text-[7px]"
                            style={{ backgroundColor: m.color }}
                          >
                            {m.symbol.slice(0, 1)}
                          </div>
                        ))}
                        <div className="w-5 h-5 rounded-full border border-[var(--color-bg)] bg-[var(--color-border)] flex items-center justify-center text-[7px] text-[var(--color-text-secondary)] font-bold">
                          +{chains.length - 5}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className="text-sm font-bold text-[var(--color-text)]">EVM Address</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)]">
                            m/44'/60'/0'/0/0
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase">BIP44</span>
                        </div>
                        <p className="text-[11px] text-[var(--color-text-secondary)]">
                          Works on: {chains.map(c => c.name).join(", ")}
                        </p>
                        {evmAddress && (
                          <p className={cn(
                            "text-[11px] font-mono mt-1 break-all leading-tight",
                            masked ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text)]",
                          )}>
                            {masked
                              ? `${evmAddress.slice(0, 6)}${"•".repeat(30)}${evmAddress.slice(-4)}`
                              : evmAddress}
                          </p>
                        )}
                        {!evmAddress && (
                          <p className="text-[11px] text-[var(--color-text-secondary)] italic mt-1">No EVM wallet connected</p>
                        )}
                      </div>
                    </div>

                    {evmAddress && (
                      <div className="flex items-center gap-2 mt-3">
                        <EvmCopyButton address={evmAddress} />
                        <EvmQrButton address={evmAddress} />
                        <a
                          href={`https://etherscan.io/address/${evmAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] hover:text-blue-400 transition-colors"
                        >
                          <ExternalLink size={11} /> Etherscan
                        </a>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                chains.map(m => (
                  <AddressCard
                    key={m.id}
                    meta={m}
                    addr={getAddress(m, evmAddress, bsvAddress, network, derived)}
                    masked={masked}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1 pt-1">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-secondary)]">
          <Shield size={10} className="text-green-400" />
          Encrypted with passkey / PIN — never leaves this device
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-secondary)]">
          <Cpu size={10} className="text-blue-400" />
          Deterministic BIP44 derivation from one master seed
        </div>
      </div>
    </div>
  );
}

// ── EVM-specific helpers (inline) ─────────────────────────────────────────────

function EvmCopyButton({ address }: { address: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast({ title: "EVM address copied" });
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] hover:text-blue-400 transition-colors"
    >
      {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function EvmQrButton({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] hover:text-blue-400 transition-colors"
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {open ? "Hide QR" : "Show QR"}
      </button>
      {open && (
        <div className="w-full mt-3 flex flex-col items-center gap-2 pt-3 border-t border-[var(--color-border)]">
          <div className="p-3 bg-white rounded-xl shadow-sm">
            <QRCodeSVG value={address} size={160} level="M" includeMargin={false} />
          </div>
          <p className="text-[10px] font-mono text-[var(--color-text-secondary)] text-center break-all max-w-xs">
            {address}
          </p>
        </div>
      )}
    </>
  );
}
