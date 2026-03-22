import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { verifyTOTP } from '@/lib/totp';

const ADMIN_EMAIL = 'aaurah@protonmail.com';
const ADMIN_PASSWORD = 'admin123';

interface AdminAuthState {
  isAuthenticated: boolean;
  twoFaEnabled: boolean;
  twoFaSetupDone: boolean;
  twoFaVerified: boolean;
  email: string | null;
  displayName: string;
  error: string | null;
  login: (email: string, password: string) => boolean;
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
      displayName: 'Aaurah',
      error: null,

      login: (email, password) => {
        if (email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
          const { twoFaEnabled } = get();
          if (!twoFaEnabled) {
            // No 2FA — grant access immediately
            set({ email: ADMIN_EMAIL, isAuthenticated: true, error: null, twoFaVerified: false });
          } else {
            // Credentials OK — hold until TOTP verified
            set({ email: ADMIN_EMAIL, error: null, twoFaVerified: false });
          }
          return true;
        }
        set({ error: 'Invalid email or password.' });
        return false;
      },

      verifyTotp: async (code) => {
        const ok = await verifyTOTP(code);
        if (ok) {
          set({ isAuthenticated: true, twoFaVerified: true, error: null });
        } else {
          set({ error: 'Incorrect code. Try again.' });
        }
        return ok;
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
      name: 'aura-admin-auth',
      partialize: (s) => ({
        twoFaEnabled: s.twoFaEnabled,
        twoFaSetupDone: s.twoFaSetupDone,
        displayName: s.displayName,
        // Never persist isAuthenticated — require re-login each session
      }),
    }
  )
);
