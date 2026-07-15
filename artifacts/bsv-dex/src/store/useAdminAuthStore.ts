import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// Admin sessions are managed entirely via HttpOnly cookies — the raw token is
// never stored in JavaScript memory or localStorage.  All fetch calls that
// require admin auth must use credentials: "include" so the browser attaches
// the cookie automatically.

interface AdminAuthState {
  isAuthenticated: boolean;
  twoFaEnabled: boolean;
  twoFaSetupDone: boolean;
  twoFaVerified: boolean;
  email: string | null;
  walletAddress: string | null;
  loginMethod: "credentials" | "wallet" | null;
  displayName: string;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginViaWallet: (address: string, signature: string) => Promise<boolean>;
  verifyTotp: (code: string) => Promise<boolean>;
  markSetupDone: () => void;
  enable2FA: () => void;
  disable2FA: () => void;
  logout: () => void;
  clearError: () => void;
  updateProfile: (fields: { displayName?: string }) => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      twoFaEnabled: false,
      twoFaSetupDone: false,
      twoFaVerified: false,
      email: null,
      walletAddress: null,
      loginMethod: null,
      displayName: 'Admin',
      error: null,

      loginViaWallet: async (address, signature) => {
        try {
          const res = await fetch(`${API}/api/admin/auth/wallet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ address, signature }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            set({ isAuthenticated: true, walletAddress: address, loginMethod: "wallet", error: null });
            return true;
          }
          set({ error: data.error ?? "Wallet login failed." });
          return false;
        } catch {
          set({ error: "Could not reach the server. Please try again." });
          return false;
        }
      },

      login: async (email, password) => {
        try {
          const res = await fetch(`${API}/api/admin/auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            const twoFaEnabled = data.twoFaEnabled ?? false;
            if (!twoFaEnabled) {
              set({ email, isAuthenticated: true, error: null, twoFaVerified: false });
            } else {
              set({ email, error: null, twoFaVerified: false });
            }
            return true;
          }
          set({ error: data.error ?? "Invalid email or password." });
          return false;
        } catch {
          set({ error: "Could not reach the server. Please try again." });
          return false;
        }
      },

      verifyTotp: async (code) => {
        try {
          const res = await fetch(`${API}/api/admin/auth/totp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ code }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            set({ isAuthenticated: true, twoFaVerified: true, error: null });
            return true;
          }
          set({ error: data.error ?? "Incorrect code. Try again." });
          return false;
        } catch {
          set({ error: "Could not reach the server. Please try again." });
          return false;
        }
      },

      markSetupDone: () => set({ twoFaSetupDone: true }),
      enable2FA: () => set({ twoFaEnabled: true, twoFaSetupDone: false }),
      disable2FA: () => set({ twoFaEnabled: false, twoFaSetupDone: false }),

      logout: () => {
        // Fire-and-forget: revoke the HttpOnly cookie session on the server.
        // credentials: "include" is required to send the cookie.
        fetch(`${API}/api/admin/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        }).catch(() => {});
        set({
          isAuthenticated: false,
          twoFaVerified: false,
          email: null,
          walletAddress: null,
          loginMethod: null,
          error: null,
        });
      },

      clearError: () => set({ error: null }),

      updateProfile: (fields) => set((s) => ({
        displayName: fields.displayName ?? s.displayName,
      })),
    }),
    {
      name: 'orahdex-admin-auth',
      partialize: (s) => ({
        isAuthenticated: s.isAuthenticated,
        twoFaEnabled: s.twoFaEnabled,
        twoFaSetupDone: s.twoFaSetupDone,
        twoFaVerified: s.twoFaVerified,
        email: s.email,
        walletAddress: s.walletAddress,
        loginMethod: s.loginMethod,
        displayName: s.displayName,
      }),
    }
  )
);

/**
 * Returns an empty object — admin auth is handled entirely via the HttpOnly
 * `admin_session` cookie, which browsers attach automatically when
 * `credentials: "include"` is set on the request.  Do not use this function
 * to add an Authorization header; use adminFetch() from lib/adminFetch.ts.
 *
 * @deprecated Use adminFetch() from lib/adminFetch.ts for all admin API calls.
 */
export function getAdminHeaders(): Record<string, string> {
  return {};
}
