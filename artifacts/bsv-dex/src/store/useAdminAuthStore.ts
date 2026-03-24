import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface AdminAuthState {
  isAuthenticated: boolean;
  twoFaEnabled: boolean;
  twoFaSetupDone: boolean;
  twoFaVerified: boolean;
  email: string | null;
  displayName: string;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
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
      displayName: 'Admin',
      error: null,

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

      logout: () => set({
        isAuthenticated: false,
        twoFaVerified: false,
        email: null,
        error: null,
      }),

      clearError: () => set({ error: null }),

      updateProfile: (fields) => set((s) => ({
        displayName: fields.displayName ?? s.displayName,
      })),
    }),
    {
      name: 'orahdex-admin-auth',
      partialize: (s) => ({
        twoFaEnabled: s.twoFaEnabled,
        twoFaSetupDone: s.twoFaSetupDone,
        displayName: s.displayName,
      }),
    }
  )
);
