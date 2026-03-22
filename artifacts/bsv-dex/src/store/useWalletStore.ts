import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WalletNetwork = 'bsv' | 'evm';

export interface ConnectedWallet {
  address: string;
  provider: string;
  network: WalletNetwork;
  chainId?: number;
  balance?: string;
}

interface WalletState {
  address: string | null;
  provider: string | null;
  network: WalletNetwork | null;
  chainId: number | null;
  isConnecting: boolean;
  connect: (wallet: ConnectedWallet) => void;
  disconnect: () => void;
  setConnecting: (connecting: boolean) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      address: null,
      provider: null,
      network: null,
      chainId: null,
      isConnecting: false,
      connect: (wallet) =>
        set({
          address: wallet.address,
          provider: wallet.provider,
          network: wallet.network,
          chainId: wallet.chainId ?? null,
          isConnecting: false,
        }),
      disconnect: () =>
        set({
          address: null,
          provider: null,
          network: null,
          chainId: null,
          isConnecting: false,
        }),
      setConnecting: (isConnecting) => set({ isConnecting }),
    }),
    { name: 'aura-dex-wallet' }
  )
);
