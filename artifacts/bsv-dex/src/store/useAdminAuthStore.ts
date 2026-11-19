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
  pendingTotpChallengeId: string | null;
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
      pendingTotpChallengeId: null,
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
            if (data.requiresTotp === true) {
              if (typeof data.challengeId !== "string" || !data.challengeId) {
                set({ error: "The server did not create a two-factor sign-in challenge." });
                return false;
              }
              set({
                email,
                isAuthenticated: false,
                twoFaEnabled: true,
                twoFaSetupDone: true,
                twoFaVerified: false,
                token: null,
                pendingTotpChallengeId: data.challengeId,
                error: null,
              });
              return true;
            }
            if (typeof data.token !== "string" || !data.token) {
              set({ error: "The server did not return an admin session." });
              return false;
            }
            set({
              email,
              isAuthenticated: true,
              twoFaEnabled: false,
              twoFaSetupDone: false,
              twoFaVerified: false,
              token: data.token,
              pendingTotpChallengeId: null,
              error: null,
            });
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
          const challengeId = get().pendingTotpChallengeId;
          if (!challengeId) {
            set({ error: "Your two-factor sign-in expired. Enter your password again." });
            return false;
          }
          const res = await fetch(`${API}/api/admin/auth/totp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, challengeId }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            if (typeof data.token !== "string" || !data.token) {
              set({ error: "The server did not return an admin session." });
              return false;
            }
            set({
              isAuthenticated: true,
              twoFaEnabled: true,
              twoFaSetupDone: true,
              twoFaVerified: true,
              token: data.token,
              pendingTotpChallengeId: null,
              error: null,
            });
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
          pendingTotpChallengeId: null,
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
        token: s.token,
      }),
    }
  )
);

export function getAdminHeaders(): Record<string, string> {
  const token = useAdminAuthStore.getState().token;
  return token ? { "x-admin-token": token } : {};
}
