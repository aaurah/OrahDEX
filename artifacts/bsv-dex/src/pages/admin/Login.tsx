import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Shield, Eye, EyeOff, Zap, Lock, Mail } from 'lucide-react';
import { useAdminAuthStore } from '@/store/useAdminAuthStore';

export function AdminLogin() {
  const [, navigate] = useLocation();
  const { isAuthenticated, login, error, clearError } = useAdminAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/admin');
  }, [isAuthenticated]);

  useEffect(() => {
    clearError();
  }, [email, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    // small delay for UX
    await new Promise((r) => setTimeout(r, 600));

    const ok = login(email, password);
    if (ok) {
      navigate('/admin');
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-primary to-orange-400 flex items-center justify-center shadow-lg shadow-primary/30">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <span className="font-extrabold text-2xl tracking-tight text-foreground">
                Aura<span className="text-primary">DEX</span>
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Shield className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium">Admin Panel — Secure Access</span>
          </div>
        </div>

        {/* Card */}
        <div
          className={`bg-card border border-border rounded-2xl p-8 shadow-2xl shadow-black/30 transition-transform ${shake ? 'animate-[shake_0.4s_ease]' : ''}`}
          style={shake ? { animation: 'shake 0.4s ease' } : {}}
        >
          <h1 className="text-xl font-bold text-foreground mb-1">Sign in to Admin</h1>
          <p className="text-sm text-muted-foreground mb-6">Enter your credentials to access the dashboard.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</label>
              <div className={`flex items-center gap-3 bg-secondary border rounded-xl px-4 py-3 transition-all ${error ? 'border-destructive/60 ring-1 ring-destructive/20' : 'border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20'}`}>
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  required
                  className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
              <div className={`flex items-center gap-3 bg-secondary border rounded-xl px-4 py-3 transition-all ${error ? 'border-destructive/60 ring-1 ring-destructive/20' : 'border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20'}`}>
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                <Shield className="w-4 h-4 text-destructive shrink-0" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white py-3.5 rounded-xl font-bold text-sm mt-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            This area is restricted to authorised administrators only.
          </p>
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to AuraDEX Exchange
          </a>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
