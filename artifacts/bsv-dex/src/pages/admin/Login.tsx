import { useState, useEffect } from 'react';
import { OrahInline } from '@/components/BrandLogo';
import { useLocation } from 'wouter';
import {
  Shield, Eye, EyeOff, Lock, Mail, Smartphone, Copy, Check,
  RefreshCw, Wallet, LogIn, Layers, AlertTriangle,
} from 'lucide-react';
import { useAdminAuthStore } from '@/store/useAdminAuthStore';
import { useWalletModalStore } from '@/store/useWalletModalStore';
import { useWalletStore } from '@/store/useWalletStore';
import { WalletConnectModal } from '@/components/WalletConnectModal';
import { generateTOTP } from '@/lib/totp';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/BrandLogo';
import { useAccount, useSignMessage, useChainId } from 'wagmi';
import { openReownModal, isReownReady } from '@/lib/reown';

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type LoginTab = 'credentials' | 'wallet';
type Step = 'credentials' | 'setup' | 'totp';

export function AdminLogin() {
  const [, navigate] = useLocation();
  const { isAuthenticated, twoFaEnabled, twoFaSetupDone, login, loginViaWallet, verifyTotp, markSetupDone, error, clearError } = useAdminAuthStore();
  const online = useOnlineStatus();

  const [tab,     setTab]     = useState<LoginTab>('credentials');
  const [step,    setStep]    = useState<Step>('credentials');
  const [emailVal, setEmailVal] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [shaking,  setShaking]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [previewCode, setPreviewCode] = useState('');

  // Wallet login state
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError,   setWalletError]   = useState('');
  const [walletChallenge, setWalletChallenge] = useState('');

  // TOTP setup data
  const [totpQrUrl,  setTotpQrUrl]  = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpIssuer, setTotpIssuer] = useState('OrahDEX');

  // Wallet connect modal (embedded on the login page)
  const { isOpen: walletModalOpen, open: openWalletModal, close: closeWalletModal } = useWalletModalStore();
  const walletStore = useWalletStore();

  // Wagmi account + signMessage
  const { address: evmAddress, isConnected: evmConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  // Track if Reown is ready for WalletConnect
  const [reownReady, setReownReady] = useState(false);
  useEffect(() => {
    if (isReownReady()) { setReownReady(true); return; }
    let tries = 0;
    const t = setInterval(() => {
      if (isReownReady()) { setReownReady(true); clearInterval(t); }
      if (++tries > 30) clearInterval(t);
    }, 200);
    return () => clearInterval(t);
  }, []);

  // Active EVM address — prefer wagmi (covers MetaMask + Reown), fallback to injected
  const injectedAddress: string | null = (() => {
    try { return (window as any).ethereum?.selectedAddress ?? null; } catch { return null; }
  })();
  const activeEvmAddress = evmAddress ?? injectedAddress ?? null;
  const canSign = !!(evmConnected || activeEvmAddress);

  // Display address for UI
  const isConnected = evmConnected || !!walletStore.address;
  const displayAddress = evmConnected && evmAddress
    ? evmAddress
    : walletStore.address ?? activeEvmAddress ?? null;

  useEffect(() => { if (isAuthenticated) navigate('/admin'); }, [isAuthenticated]);
  useEffect(() => { clearError(); }, [emailVal, password, totpCode]);
  useEffect(() => { if (tab === 'credentials') { setWalletError(''); setWalletChallenge(''); } }, [tab]);

  // Fetch TOTP setup info
  useEffect(() => {
    if (step !== 'setup') return;
    fetch(`${API}/api/admin/auth/totp-uri`)
      .then(r => r.json())
      .then(d => {
        setTotpQrUrl(d.qrUrl ?? '');
        const match = (d.uri ?? '').match(/secret=([^&]+)/);
        if (match) setTotpSecret(match[1]);
        const issuerMatch = (d.uri ?? '').match(/issuer=([^&]+)/);
        if (issuerMatch) setTotpIssuer(decodeURIComponent(issuerMatch[1]));
      })
      .catch(() => {});
  }, [step]);

  useEffect(() => {
    if (step !== 'setup' || !totpSecret) return;
    const refresh = () => generateTOTP(totpSecret).then(setPreviewCode);
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [step, totpSecret]);

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailVal || !password) return;
    setLoading(true);
    const ok = await login(emailVal, password);
    setLoading(false);
    if (ok) {
      if (twoFaEnabled) setStep(twoFaSetupDone ? 'totp' : 'setup');
    } else {
      triggerShake();
    }
  };

  const handleSetupDone = () => {
    markSetupDone();
    setStep('totp');
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    setLoading(true);
    const ok = await verifyTotp(totpCode);
    setLoading(false);
    if (!ok) { triggerShake(); setTotpCode(''); }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(totpSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Wallet login flow ────────────────────────────────────────────────────
  const handleWalletLogin = async () => {
    const signerAddress = activeEvmAddress;
    if (!signerAddress) {
      setWalletError('Connect an EVM wallet first — MetaMask, WalletConnect, or Coinbase Wallet.');
      return;
    }
    setWalletLoading(true);
    setWalletError('');
    try {
      // 1. Get challenge nonce from server
      const chalRes = await fetch(`${API}/api/admin/auth/wallet-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: signerAddress }),
      });
      const chalData = await chalRes.json();
      if (!chalRes.ok) {
        setWalletError(chalData.error ?? 'Failed to get challenge');
        setWalletLoading(false);
        return;
      }
      setWalletChallenge(chalData.message);

      // 2. Sign — try wagmi first (MetaMask + Reown/WalletConnect), then injected window.ethereum
      let signature: string;
      if (evmConnected) {
        signature = await signMessageAsync({ message: chalData.message });
      } else {
        const eth = (window as any).ethereum;
        if (!eth) throw new Error('No EVM wallet detected. Install MetaMask or use WalletConnect.');
        const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
        if (!accounts.length) throw new Error('No accounts returned from wallet.');
        signature = await eth.request({
          method: 'personal_sign',
          params: [chalData.message, accounts[0]],
        });
      }

      // 3. Verify + authenticate against server whitelist
      const ok = await loginViaWallet(signerAddress, signature);
      if (!ok) triggerShake();
    } catch (err: any) {
      if (err?.code === 4001 || err?.name === 'UserRejectedRequestError') {
        setWalletError('Signature request rejected. Please approve the signing request in your wallet.');
      } else {
        setWalletError(err?.message ?? 'Wallet sign-in failed.');
      }
    }
    setWalletLoading(false);
  };

  const cardClass = `bg-card border border-border rounded-2xl p-8 shadow-2xl shadow-black/30 transition-all ${shaking ? 'animate-[shake_0.4s_ease]' : ''}`;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <BrandLogo textSize="text-3xl" />
          </div>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Shield className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium">Admin Panel — Secure Access</span>
          </div>
        </div>

        {/* Tab switcher (only shown on credentials step) */}
        {step === 'credentials' && (
          <div className="flex gap-1 bg-secondary/50 border border-border rounded-xl p-1 mb-5">
            <button
              onClick={() => { setTab('credentials'); clearError(); setWalletError(''); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all",
                tab === 'credentials'
                  ? "bg-card border border-border text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Mail className="w-4 h-4" /> Email & Password
            </button>
            <button
              onClick={() => { setTab('wallet'); clearError(); setWalletError(''); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all",
                tab === 'wallet'
                  ? "bg-card border border-border text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Wallet className="w-4 h-4" /> Connect Wallet
            </button>
          </div>
        )}

        {/* 2FA progress steps */}
        {twoFaEnabled && step !== 'credentials' && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {(['credentials', twoFaSetupDone ? 'totp' : 'setup', 'totp'] as const)
              .filter((s, i, arr) => arr.indexOf(s) === i)
              .map((s, idx, arr) => {
                const done = arr.indexOf(step) > idx;
                const active = step === s;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      done ? 'bg-green-500 text-white' :
                      active ? 'bg-primary text-white' :
                      'bg-secondary text-muted-foreground'
                    }`}>{done ? '✓' : idx + 1}</div>
                    {idx < arr.length - 1 && <div className={`w-8 h-0.5 rounded ${done ? 'bg-green-500' : 'bg-border'}`} />}
                  </div>
                );
              })}
          </div>
        )}

        {/* ── Credentials tab ── */}
        {step === 'credentials' && tab === 'credentials' && (
          <div className={cardClass}>
            <h1 className="text-xl font-bold text-foreground mb-1">Sign in to Admin</h1>
            <p className="text-sm text-muted-foreground mb-6">Enter your administrator credentials.</p>

            <form onSubmit={handleCredentials} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</label>
                <div className={`flex items-center gap-3 bg-secondary border rounded-xl px-4 py-3 transition-all ${error ? 'border-destructive/60' : 'border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20'}`}>
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="email"
                    value={emailVal}
                    onChange={e => setEmailVal(e.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="email"
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
                <div className={`flex items-center gap-3 bg-secondary border rounded-xl px-4 py-3 transition-all ${error ? 'border-destructive/60' : 'border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20'}`}>
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none text-sm"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="text-muted-foreground hover:text-foreground transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                  <Shield className="w-4 h-4 text-destructive shrink-0" />
                  <span className="text-sm text-destructive">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !emailVal || !password}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white py-3.5 rounded-xl font-bold text-sm mt-1 shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying...</> : <><Shield className="w-4 h-4" />Continue</>}
              </button>
            </form>
            <p className="text-center text-xs text-muted-foreground mt-5">This area is restricted to authorised administrators only.</p>
          </div>
        )}

        {/* ── Wallet tab ── */}
        {step === 'credentials' && tab === 'wallet' && (
          <div className={cardClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center">
                <Wallet className="w-4.5 h-4.5 text-green-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Wallet Sign-In</h1>
                <p className="text-xs text-muted-foreground">Sign a message with your EVM wallet to verify identity</p>
              </div>
            </div>

            {/* Whitelist-only notice */}
            <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/25 rounded-xl px-4 py-3 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300">Whitelisted addresses only</p>
                <p className="text-[11px] text-amber-400/70 mt-0.5">
                  Only pre-approved EVM wallet addresses are permitted. Unauthorised addresses will be rejected.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Wallet status card */}
              <div className={cn(
                "rounded-xl border p-4 transition-all",
                canSign ? "bg-green-500/8 border-green-500/20" : "bg-secondary/40 border-border"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", canSign ? "bg-green-400 animate-pulse" : "bg-muted-foreground/50")} />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {canSign ? "EVM Wallet Ready" : "No Wallet Connected"}
                    </span>
                  </div>
                  {evmConnected && chainId && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/25 text-blue-400 uppercase">
                      Chain {chainId}
                    </span>
                  )}
                </div>
                {canSign && activeEvmAddress ? (
                  <code className="text-sm font-mono text-green-300 block truncate">
                    {activeEvmAddress.slice(0, 14)}…{activeEvmAddress.slice(-10)}
                  </code>
                ) : (
                  <p className="text-sm text-muted-foreground/70">Connect your EVM wallet below to continue</p>
                )}
              </div>

              {/* Primary: WalletConnect via Reown */}
              <button
                onClick={() => reownReady ? openReownModal('Connect') : openWalletModal()}
                className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-violet-600/90 to-blue-600/80 border border-violet-500/30 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 40 25" fill="currentColor">
                  <path d="M8.19 4.63C14.64-1.82 25.36-1.82 31.81 4.63l.77.77a.79.79 0 010 1.12l-2.65 2.65a.42.42 0 01-.58 0l-1.06-1.06c-4.52-4.52-11.85-4.52-16.37 0l-1.13 1.13a.42.42 0 01-.58 0L7.56 6.59a.79.79 0 010-1.12l.63-.84zM37.28 10.1l2.36 2.36a.79.79 0 010 1.12L28.5 24.72a.83.83 0 01-1.17 0l-7.67-7.67a.21.21 0 00-.29 0l-7.67 7.67a.83.83 0 01-1.17 0L-.3 13.58a.79.79 0 010-1.12l2.36-2.36a.83.83 0 011.17 0l7.67 7.67c.08.08.21.08.29 0l7.67-7.67a.83.83 0 011.17 0l7.67 7.67c.08.08.21.08.29 0l7.67-7.67a.83.83 0 011.17 0z"/>
                </svg>
                Connect via WalletConnect
              </button>

              {/* Secondary: MetaMask (injected) */}
              {!canSign && (window as any).ethereum && (
                <button
                  onClick={async () => {
                    try {
                      await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
                    } catch { /* user rejected */ }
                  }}
                  className="w-full flex items-center justify-center gap-2.5 bg-orange-500/10 border border-orange-500/25 text-orange-300 hover:text-orange-200 hover:border-orange-500/50 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 35 33" fill="currentColor">
                    <path d="M32.96 1L19.38 10.86l2.46-5.84L32.96 1z" fill="#E2761B"/>
                    <path d="M2.04 1l13.46 9.96-2.34-5.94L2.04 1z" fill="#E4761B"/>
                    <path d="M28.18 23.52l-3.6 5.52 7.7 2.12 2.22-7.5-6.32-.14zM1.54 23.66l2.2 7.5 7.7-2.12-3.6-5.52-6.3.14z" fill="#E4761B"/>
                    <path d="M11.06 14.26l-2.16 3.26 7.66.34-.28-8.24-5.22 4.64zM23.94 14.26l-5.3-4.74-.18 8.34 7.64-.34-2.16-3.26z" fill="#E4761B"/>
                    <path d="M11.44 29.04l4.6-2.24-3.96-3.1-.64 5.34zM18.96 26.8l4.6 2.24-.64-5.34-3.96 3.1z" fill="#E4761B"/>
                  </svg>
                  Connect MetaMask
                </button>
              )}

              {/* Switch wallet (when already connected) */}
              {canSign && (
                <button
                  onClick={() => reownReady ? openReownModal('Connect') : openWalletModal()}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 text-xs font-medium transition-all"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Switch Wallet
                </button>
              )}

              {/* Challenge message preview */}
              {walletChallenge && (
                <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3">
                  <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-bold">Message to Sign</p>
                  <pre className="text-xs text-foreground/70 whitespace-pre-wrap font-mono leading-relaxed">{walletChallenge}</pre>
                </div>
              )}

              {/* Error display */}
              {(walletError || error) && (
                <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                  <Shield className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <span className="text-sm text-destructive">{walletError || error}</span>
                </div>
              )}

              {/* Sign & access button */}
              <button
                onClick={handleWalletLogin}
                disabled={walletLoading || !canSign}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-500 text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-green-500/20 hover:shadow-green-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {walletLoading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing...</>
                  : <><LogIn className="w-4 h-4" />Sign & Access Admin</>
                }
              </button>

              <p className="text-center text-[11px] text-muted-foreground/60">
                {canSign
                  ? 'Signing is free — no gas fee required. Your address must be in the admin whitelist.'
                  : 'Connect your EVM wallet (MetaMask, WalletConnect, Coinbase) to sign in.'}
              </p>
            </div>
          </div>
        )}

        {/* Embedded wallet connect modal */}
        <WalletConnectModal isOpen={walletModalOpen} onClose={closeWalletModal} />

        {/* ── 2FA Setup ── */}
        {step === 'setup' && (
          <div className={cardClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                <Smartphone className="w-4.5 h-4.5 text-violet-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Set Up 2FA</h1>
                <p className="text-xs text-muted-foreground">One-time setup with Google Authenticator</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center gap-3 border border-border">
                {totpQrUrl ? (
                  <img src={totpQrUrl} alt="TOTP QR Code" className="w-44 h-44 rounded-lg bg-white p-1" onError={e => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <div className="w-44 h-44 rounded-lg bg-secondary flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Scan with <span className="text-foreground font-medium">Google Authenticator</span>, Authy, or any TOTP app
                </p>
              </div>

              {totpSecret && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Or enter this secret manually:</p>
                  <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2.5">
                    <code className="flex-1 text-xs font-mono text-primary tracking-widest">{totpSecret}</code>
                    <button onClick={copySecret} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Issuer: <span className="text-foreground">{totpIssuer}</span> · SHA-1 · 6 digits · 30 sec</p>
                </div>
              )}

              {previewCode && (
                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-green-400 animate-spin" style={{ animationDuration: '3s' }} />
                    <span className="text-xs text-green-400">Current code (refreshes every 30s)</span>
                  </div>
                  <code className="text-lg font-mono font-bold text-green-400 tracking-widest">{previewCode}</code>
                </div>
              )}

              <button
                onClick={handleSetupDone}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
              >
                <Check className="w-4 h-4" />
                I've added it — Continue
              </button>
            </div>
          </div>
        )}

        {/* ── TOTP verification ── */}
        {step === 'totp' && (
          <div className={cardClass}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                <Smartphone className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Two-Factor Authentication</h1>
                <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app</p>
              </div>
            </div>

            <form onSubmit={handleTotp} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Authentication Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  className={`w-full bg-secondary border rounded-xl px-4 py-4 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none transition-all ${
                    error ? 'border-destructive/60 ring-1 ring-destructive/20' : 'border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20'
                  }`}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                  <Shield className="w-4 h-4 text-destructive shrink-0" />
                  <span className="text-sm text-destructive">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying...</> : <><Shield className="w-4 h-4" />Verify & Sign In</>}
              </button>

              <button
                type="button"
                onClick={() => { clearError(); setStep('credentials'); setTotpCode(''); }}
                className="text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
              >
                ← Back to credentials
              </button>
            </form>
          </div>
        )}

        <div className="text-center mt-6">
          <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to <OrahInline className="text-xs" /> Exchange
          </a>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  );
}
