import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Shield, Eye, EyeOff, Lock, Mail, Smartphone, Copy, Check,
  RefreshCw, Wallet, AlertTriangle, LogIn,
} from 'lucide-react';
import { useAdminAuthStore } from '@/store/useAdminAuthStore';
import { generateTOTP } from '@/lib/totp';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import { useAccount, useSignMessage } from 'wagmi';

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

  // Wagmi account + signMessage
  const { address: evmAddress, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

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
    if (!isConnected || !evmAddress) {
      setWalletError('Connect your wallet first using the button above.');
      return;
    }
    setWalletLoading(true);
    setWalletError('');
    try {
      // 1. Get challenge
      const chalRes = await fetch(`${API}/api/admin/auth/wallet-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: evmAddress }),
      });
      const chalData = await chalRes.json();
      if (!chalRes.ok) {
        setWalletError(chalData.error ?? 'Failed to get challenge');
        setWalletLoading(false);
        return;
      }
      setWalletChallenge(chalData.message);

      // 2. Sign the message
      const signature = await signMessageAsync({ message: chalData.message });

      // 3. Verify + authenticate
      const ok = await loginViaWallet(evmAddress, signature);
      if (!ok) triggerShake();
    } catch (err: any) {
      if (err?.code === 4001 || err?.name === 'UserRejectedRequestError') {
        setWalletError('Signature request was rejected. Please try again.');
      } else {
        setWalletError(err?.message ?? 'Wallet login failed');
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
          <div className="flex items-center justify-center gap-3 mb-4">
            <div
              className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 via-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30"
              title={online ? 'Connected' : 'No internet'}
            >
              <span className="text-white font-black text-xl leading-none select-none" style={{ fontFamily: "Inter, sans-serif" }}>O</span>
              <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
                <span className="relative flex items-center justify-center w-[7px] h-[7px]">
                  {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />}
                  <span className={`relative rounded-full w-[7px] h-[7px] ${online ? 'bg-white' : 'bg-red-400'}`} />
                </span>
              </span>
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-foreground">
              Orah<span className="text-green-400">DEX</span>
            </span>
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
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center">
                <Wallet className="w-4.5 h-4.5 text-green-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Wallet Sign-In</h1>
                <p className="text-xs text-muted-foreground">Whitelisted addresses only — no password needed</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Wallet status */}
              <div className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 border",
                isConnected
                  ? "bg-green-500/10 border-green-500/20"
                  : "bg-secondary border-border"
              )}>
                <div className={cn("w-2 h-2 rounded-full shrink-0", isConnected ? "bg-green-400 animate-pulse" : "bg-muted-foreground")} />
                {isConnected && evmAddress ? (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Connected wallet</p>
                    <code className="text-sm font-mono text-green-300 truncate block">
                      {evmAddress.slice(0, 10)}...{evmAddress.slice(-8)}
                    </code>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No wallet connected</p>
                )}
              </div>

              {!isConnected && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300 leading-relaxed">
                    Use the wallet connect button in the top navigation bar of the exchange to connect your wallet first, then return here.
                  </p>
                </div>
              )}

              {walletChallenge && (
                <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3">
                  <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-bold">Message to Sign</p>
                  <pre className="text-xs text-foreground/70 whitespace-pre-wrap font-mono leading-relaxed">{walletChallenge}</pre>
                </div>
              )}

              {(walletError || error) && (
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                  <Shield className="w-4 h-4 text-destructive shrink-0" />
                  <span className="text-sm text-destructive">{walletError || error}</span>
                </div>
              )}

              <button
                onClick={handleWalletLogin}
                disabled={walletLoading || !isConnected}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-500 text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-green-500/20 hover:shadow-green-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
              >
                {walletLoading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing...</>
                  : <><LogIn className="w-4 h-4" />Sign & Access Admin</>
                }
              </button>

              <p className="text-center text-xs text-muted-foreground">
                Your wallet must be in the admin whitelist. Signing does not cost gas.
              </p>
            </div>
          </div>
        )}

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
            ← Back to OrahDEX Exchange
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
