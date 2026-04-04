import { useRef, useState, useEffect } from 'react';
import { LogOut, RefreshCw, Wallet, Copy, Check, ChevronDown, FlaskConical, RotateCcw } from 'lucide-react';
import { useWalletStore } from '@/store/useWalletStore';
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
  /** If true renders the compact pill style (mobile header) */
  compact?: boolean;
}

export function WalletOptionsDropdown({ compact = false }: Props) {
  const { address, provider, network, balance, isDemo, disconnect } = useWalletStore();
  const { open: openWalletModal } = useWalletModalStore();
  const [open, setOpen]       = useState(false);
  const [copied, setCopied]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
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
        network === 'evm' ? 'ETH' : network === 'bsv' ? 'BSV' : network === 'sol' ? 'SOL' : 'BTC'
      }`
    : null;

  const copyAddress = () => {
    navigator.clipboard.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDisconnect = async () => {
    setOpen(false);
    if (provider === 'reown') {
      await disconnectReown();
    }
    disconnect();
  };

  const handleSwitch = async () => {
    setOpen(false);
    if (provider === 'reown') {
      await disconnectReown();
      disconnect();
      setTimeout(() => openReownModal("Connect"), 500);
    } else {
      disconnect();
      openWalletModal();
    }
  };

  const handleResetDemo = async () => {
    if (!address) return;
    setResetting(true);
    try {
      await fetch(`${API_BASE}/demo/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      // Trigger a page refresh so balances reload
      window.location.reload();
    } catch {
      // Silently ignore — user can retry
    } finally {
      setResetting(false);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      {compact ? (
        /* Mobile compact pill */
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
        /* Desktop pill */
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          <div className="flex flex-col items-start">
            {provider && (
              <span className="text-[10px] text-muted-foreground capitalize leading-none">{provider}</span>
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
                  <span className="text-xs text-muted-foreground capitalize font-medium">{provider} · {network?.toUpperCase()}</span>
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

          {/* Change chain — only for EVM */}
          {network === 'evm' && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Change Chain</p>
              <ChainSwitcherDropdown inline />
            </div>
          )}

          {/* Actions */}
          <div className="p-2 flex flex-col gap-1">
            {isDemo ? (
              <>
                {/* Reset demo balance */}
                <button
                  onClick={handleResetDemo}
                  disabled={resetting}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-yellow-500/10 transition-colors text-left group disabled:opacity-60"
                >
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center shrink-0">
                    {resetting
                      ? <RotateCcw className="w-4 h-4 text-yellow-400 animate-spin" />
                      : <RotateCcw className="w-4 h-4 text-yellow-400" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-yellow-400">Reset Balance</p>
                    <p className="text-[11px] text-muted-foreground">Refill to $80,000 paper funds</p>
                  </div>
                </button>

                {/* Connect real wallet */}
                <button
                  onClick={handleSwitch}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Connect Real Wallet</p>
                    <p className="text-[11px] text-muted-foreground">Trade with your actual funds</p>
                  </div>
                </button>

                {/* Exit demo */}
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-destructive/10 transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                    <LogOut className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-destructive">Exit Demo</p>
                    <p className="text-[11px] text-muted-foreground">Leave demo mode</p>
                  </div>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSwitch}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <RefreshCw className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Switch Wallet</p>
                    <p className="text-[11px] text-muted-foreground">Connect a different account</p>
                  </div>
                </button>

                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-destructive/10 transition-colors text-left group"
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
