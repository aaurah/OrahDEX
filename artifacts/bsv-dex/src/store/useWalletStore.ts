import { create } from 'zustand';

interface WalletState {
  address: string | null;
  provider: string | null;
  connect: (address: string, provider: string) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  provider: null,
  connect: (address, provider) => set({ address, provider }),
  disconnect: () => set({ address: null, provider: null }),
}));
