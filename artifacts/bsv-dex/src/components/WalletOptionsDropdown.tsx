import { useRef, useState, useEffect } from 'react';
import { LogOut, Wallet, Copy, Check, ChevronDown, FlaskConical, RotateCcw, ArrowLeftRight, Loader2 } from 'lucide-react';
import { useWalletStore, type WalletNetwork } from '@/store/useWalletStore';
import { useWalletModalStore } from '@/store/useWalletModalStore';
import { disconnectReown, openReownModal } from '@/lib/reown';
import { ChainSwitcherDropdown } from './ChainSwitcherDropdown';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

function shortenAddress(addr: string) {
  if (!addr) return '';
  if (addr.includes('@')) return addr; // paymail
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

interface Props {
  compact?: boolean;
}

const NETWORK_LABELS: Record<WalletNetwork, string> = {
  evm: 'EVM', bsv: 'BSV', btc: 'BTC', sol: 'SOL', tron: 'TRON', bch: 'BCH',
};
const NETWORK_ICONS: Record<WalletNetwork, string> = {
  evm: '⟠', bsv: '₿', btc: '₿', sol: '◎', tron: '⊕', bch: '฿',
};

export function WalletOptionsDropdown({ compact = false }: Props) {
  const {
    address, provider, network, balance, isDemo,
    disconnect, connectDemo, switchNetworkType,
    internalBsvAddress, internalBtcAddress, internalSolAddress, internalEvmAddress, internalBchAddress,
  } = useWalletStore();
  const { open: openWalletModal } = useWalletModalStore();
  const [open, setOpen]           = useState(false);
  const [copied, setCopied]       = useState(false);
  const [resetting, setResetting] = useState(false);
  const [switchingDemo, setSwitchingDemo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!address) return null;

  const balanceLabel = balance
    ? `${parseFloat(balance).toFixed(4)} ${
        network === 'evm' ? 'ETH' : network === 'bsv' ? 'BSV' : network === 'sol' ? 'SOL' : network === 'bch' ? 'BCH' : 'BTC'
      }`
    : null;

  const copyAddress = () => {
    navigator.clipboard.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDisconnect = async () => {
    setOpen(false);
    if (provider === 'reown') await disconnectReown();
    disconnect();
  };

  /** Switch wallet (keeps same account type) */
  const handleSwitchWallet = async () => {
    setOpen(false);
    if (provider === 'reown') {
      await disconnectReown();
      disconnect();
      setTimeout(() => openReownModal("Connect"), 500);
    } else {
      disconnect();
      openWalletModal('real');
    }
  };

  /** Real → Demo: activate demo directly, no modal needed */
  const handleSwitchToDemo = async () => {
    setSwitchingDemo(true);
    try {
      // Disconnect current real wallet
      if (provider === 'reown') await disconnectReown();
      disconnect();

      // Get or create stable demo address
      let demoAddr = localStorage.getItem('orahdex_demo_address');
      if (!demoAddr) {
        const uuid = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
        demoAddr = `DEMO_${uuid}`;
        localStorage.setItem('orahdex_demo_address', demoAddr);
      }

      const res = await fetch(`${API_BASE}/demo/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: demoAddr }),
      });
      if (!res.ok) throw new Error('Demo activation failed');
      connectDemo(demoAddr);
      setOpen(false);
    } catch {
      // Silently ignore — user can retry
    } finally {
      setSwitchingDemo(false);
    }
  };

  /** Demo → Real: open modal straight to Real Account tab */
  const handleSwitchToReal = async () => {
    setOpen(false);
    disconnect();
    openWalletModal('real');
  };

  const handleResetDemo = async () => {
    if (!address) return;
    setResetting(true);
    try {
      await fetch(`${API_BASE}/demo/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      window.location.reload();
    } catch {
      // Silently ignore
    } finally {
      setResetting(false);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      {compact ? (
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-[5px] rounded-lg active:opacity-70 transition-opacity max-w-[160px]"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
          <div className="flex flex-col items-start min-w-0">
            <span className="text-[11px] font-mono text-white leading-tight truncate">
              {shortenAddress(address)}
            </span>
            {balanceLabel && (
              <span className="text-[9px] text-green-400 font-semibold leading-tight">{balanceLabel}</span>
            )}
          </div>
          <ChevronDown className={cn('w-3 h-3 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
      ) : (
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          <div className="flex flex-col items-start">
            {provider && (
              <span className="text-[10px] text-muted-foreground leading-none">
                {provider === 'orah-wallet' ? 'Orah Wallet' : provider}
              </span>
            )}
            <span className="text-sm font-mono text-foreground leading-tight">
              {shortenAddress(address)}
            </span>
          </div>
          {balanceLabel && (
            <span className="text-[10px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded">
              {balanceLabel}
            </span>
          )}
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
      )}

      {/* Dropdown panel */}
      {open && (
        <div className={cn(
          'absolute z-50 mt-2 bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden',
          compact ? 'right-0 w-64' : 'right-0 w-72'
        )}>
          {/* Header */}
          <div className={cn("px-4 pt-4 pb-3 border-b border-border", isDemo && "bg-yellow-500/5")}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {isDemo ? (
                  <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 uppercase tracking-wider">
                    <FlaskConical className="w-3 h-3" /> Demo Mode
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground font-medium">
                    {provider === 'orah-wallet' ? 'Orah Wallet' : provider} · {network?.toUpperCase()}
                  </span>
                )}
              </div>
              <button
                onClick={copyAddress}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                title="Copy address"
              >
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-sm font-mono text-foreground break-all leading-snug">{address}</p>
            {isDemo && (
              <p className="text-[11px] text-yellow-400/80 font-semibold mt-1">$80,000 paper-trading funds · no real money</p>
            )}
            {!isDemo && balanceLabel && (
              <p className="text-xs text-green-400 font-semibold mt-1">{balanceLabel}</p>
            )}
          </div>

          {/* Quick switch bar — always visible */}
          <div className="px-3 py-2.5 border-b border-border bg-secondary/30">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Account Type</p>
            <div className="flex gap-1.5">
              <button
                onClick={isDemo ? handleSwitchToReal : undefined}
                disabled={!isDemo}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all",
                  !isDemo
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-white/5 text-muted-foreground hover:bg-white/8 hover:text-foreground border border-transparent"
                )}
              >
                <Wallet className="w-3 h-3" />
                Real Account
                {!isDemo && <span className="w-1.5 h-1.5 rounded-full bg-green-400 ml-0.5" />}
              </button>
              <button
                onClick={!isDemo ? handleSwitchToDemo : undefined}
                disabled={isDemo || switchingDemo}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all",
                  isDemo
                    ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                    : "bg-white/5 text-muted-foreground hover:bg-yellow-500/10 hover:text-yellow-300 border border-transparent"
                )}
              >
                {switchingDemo
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <FlaskConical className="w-3 h-3" />
                }
                Demo
                {isDemo && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-0.5" />}
              </button>
            </div>
          </div>

          {/* Network type switcher — shown for multi-chain wallets (passkey/HD) */}
          {!isDemo && (() => {
            // Determine which networks this wallet supports
            const evmAddr   = internalEvmAddress ?? (network === 'evm' ? address : null);
            const available: WalletNetwork[] = [];
            if (evmAddr)               available.push('evm');
            if (internalBsvAddress)    available.push('bsv');
            if (internalBtcAddress)    available.push('btc');
            if (internalSolAddress)    available.push('sol');
            if (internalBchAddress)    available.push('bch');
            if (available.length < 2)  return null; // single-network wallet — nothing to switch
            return (
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Network</p>
                <div className="flex gap-1">
                  {available.map((net) => {
                    const isActive = network === net;
                    return (
                      <button
                        key={net}
                        onClick={() => { if (!isActive) { switchNetworkType(net); setOpen(false); } }}
                        disabled={isActive}
                        className={cn(
                          "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-bold transition-all border",
                          isActive
                            ? "bg-primary/15 text-primary border-primary/40"
                            : "bg-white/5 text-muted-foreground border-transparent hover:bg-white/10 hover:text-foreground"
                        )}
                      >
                        <span className="text-base leading-none">{NETWORK_ICONS[net]}</span>
                        <span>{NETWORK_LABELS[net]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Change EVM chain — only for EVM real accounts */}
          {network === 'evm' && !isDemo && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Change EVM Chain</p>
              <ChainSwitcherDropdown inline />
            </div>
          )}

          {/* Actions */}
          <div className="p-2 flex flex-col gap-1">
            {isDemo ? (
              <>
                <button
                  onClick={handleResetDemo}
                  disabled={resetting}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-yellow-500/10 transition-colors text-left disabled:opacity-60"
                >
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center shrink-0">
                    <RotateCcw className={cn("w-4 h-4 text-yellow-400", resetting && "animate-spin")} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-yellow-400">Reset Balance</p>
                    <p className="text-[11px] text-muted-foreground">Refill to $80,000 paper funds</p>
                  </div>
                </button>

                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-destructive/10 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                    <LogOut className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-destructive">Exit Demo</p>
                    <p className="text-[11px] text-muted-foreground">Disconnect and leave demo mode</p>
                  </div>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSwitchWallet}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ArrowLeftRight className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Switch Wallet</p>
                    <p className="text-[11px] text-muted-foreground">Connect a different real wallet</p>
                  </div>
                </button>

                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-destructive/10 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                    <LogOut className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-destructive">Disconnect</p>
                    <p className="text-[11px] text-muted-foreground">Remove wallet from OrahDEX</p>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
