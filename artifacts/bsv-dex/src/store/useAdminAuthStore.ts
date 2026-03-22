import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const ADMIN_EMAIL = 'aaurah@protonmail.com';
const ADMIN_PASSWORD = 'admin123';

interface AdminAuthState {
  isAuthenticated: boolean;
  email: string | null;
  error: string | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  clearError: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      email: null,
      error: null,
      login: (email, password) => {
        if (email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
          set({ isAuthenticated: true, email: ADMIN_EMAIL, error: null });
          return true;
        }
        set({ error: 'Invalid email or password.' });
        return false;
      },
      logout: () => set({ isAuthenticated: false, email: null, error: null }),
      clearError: () => set({ error: null }),
    }),
    { name: 'aura-admin-auth' }
  )
);
