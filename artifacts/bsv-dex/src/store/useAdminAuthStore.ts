import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { verifyTOTP } from '@/lib/totp';

const ADMIN_EMAIL = 'aaurah@protonmail.com';
const ADMIN_PASSWORD = 'admin123';

interface AdminAuthState {
  isAuthenticated: boolean;
  twoFaSetupDone: boolean;
  twoFaVerified: boolean;
  email: string | null;
  error: string | null;
  // Step 1
  login: (email: string, password: string) => boolean;
  // Step 2
  verifyTotp: (code: string) => Promise<boolean>;
  markSetupDone: () => void;
  logout: () => void;
  clearError: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      twoFaSetupDone: false,
      twoFaVerified: false,
      email: null,
      error: null,

      login: (email, password) => {
        if (email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
          // Credentials OK — mark email, but not fully authenticated until 2FA
          set({ email: ADMIN_EMAIL, error: null, twoFaVerified: false });
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

      logout: () => set({
        isAuthenticated: false,
        twoFaVerified: false,
        email: null,
        error: null,
      }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'aura-admin-auth',
      partialize: (s) => ({
        twoFaSetupDone: s.twoFaSetupDone,
        // Never persist isAuthenticated — require re-login each session
      }),
    }
  )
);
