import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface AdminAuthState {
  isAuthenticated: boolean;
  twoFaEnabled: boolean;
  twoFaSetupDone: boolean;
  twoFaVerified: boolean;
  email: string | null;
  walletAddress: string | null;
  loginMethod: "credentials" | "wallet" | null;
  displayName: string;
  token: string | null;
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
    (set, get) => ({
      isAuthenticated: false,
      twoFaEnabled: false,
      twoFaSetupDone: false,
      twoFaVerified: false,
      email: null,
      walletAddress: null,
      loginMethod: null,
      displayName: 'Admin',
      token: null,
      error: null,

      loginViaWallet: async (address, signature) => {
        try {
          const res = await fetch(`${API}/api/admin/auth/wallet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, signature }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            set({ isAuthenticated: true, walletAddress: address, loginMethod: "wallet", token: data.token ?? null, error: null });
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
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            const { twoFaEnabled } = get();
            if (!twoFaEnabled) {
              set({ email, isAuthenticated: true, token: data.token ?? null, error: null, twoFaVerified: false });
            } else {
              set({ email, token: data.token ?? null, error: null, twoFaVerified: false });
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
            body: JSON.stringify({ code }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            set({ isAuthenticated: true, twoFaVerified: true, token: data.token ?? null, error: null });
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
        const token = get().token;
        if (token) {
          fetch(`${API}/api/admin/auth/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-token": token },
          }).catch(() => {});
        }
        set({
          isAuthenticated: false,
          twoFaVerified: false,
          email: null,
          walletAddress: null,
          loginMethod: null,
          token: null,
          error: null,
        });
      },

      clearError: () => set({ error: null }),

      updateProfile: (fields) => set((s) => ({
        displayName: fields.displayName ?? s.displayName,
      })),
    }),
    {
      name: 'orah-admin-auth',
      partialize: (s) => ({
        isAuthenticated: s.isAuthenticated,
        twoFaEnabled: s.twoFaEnabled,
        twoFaSetupDone: s.twoFaSetupDone,
        twoFaVerified: s.twoFaVerified,
        email: s.email,
        walletAddress: s.walletAddress,
        loginMethod: s.loginMethod,
        displayName: s.displayName,
        token: s.token,
      }),
    }
  )
);

export function getAdminHeaders(): Record<string, string> {
  const token = useAdminAuthStore.getState().token;
  return token ? { "x-admin-token": token } : {};
}
