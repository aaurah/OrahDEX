import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_BASE } from '@/lib/api';

export interface HandCashProfile {
  handle:      string;
  displayName: string;
  avatarUrl:   string | null;
  paymail:     string;
}

interface HandCashState {
  authToken: string | null;
  profile:   HandCashProfile | null;
  balance:   number | null;

  setAuth:     (authToken: string, profile: HandCashProfile) => void;
  setBalance:  (balance: number) => void;
  disconnect:  () => void;
  isConnected: () => boolean;

  /** Fetch and cache spendable BSV balance from the API */
  fetchBalance: () => Promise<void>;
}

export const useHandCashStore = create<HandCashState>()(
  persist(
    (set, get) => ({
      authToken: null,
      profile:   null,
      balance:   null,

      setAuth:     (authToken, profile) => set({ authToken, profile }),
      setBalance:  (balance)            => set({ balance }),
      disconnect:  ()                   => set({ authToken: null, profile: null, balance: null }),
      isConnected: ()                   => !!get().authToken,

      fetchBalance: async () => {
        const { authToken } = get();
        if (!authToken) return;
        try {
          const res = await fetch(`${API_BASE}/handcash/balance?authToken=${encodeURIComponent(authToken)}`);
          if (!res.ok) return;
          const data = await res.json();
          set({ balance: data.bsv ?? 0 });
        } catch { /* non-fatal */ }
      },
    }),
    { name: "orahdex-handcash-v1" },
  ),
);
