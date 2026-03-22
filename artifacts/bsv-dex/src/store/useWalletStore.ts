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
  bsvAddress: string | null;
  bsvMnemonic: string[] | null;
  disconnectPending: boolean;
  connect: (wallet: ConnectedWallet) => void;
  disconnect: () => void;
  requestDisconnect: () => void;
  cancelDisconnect: () => void;
  setConnecting: (connecting: boolean) => void;
  setBsvWallet: (address: string, mnemonic: string[]) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      address: null,
      provider: null,
      network: null,
      chainId: null,
      isConnecting: false,
      bsvAddress: null,
      bsvMnemonic: null,
      disconnectPending: false,
      connect: (wallet) =>
        set({
          address: wallet.address,
          provider: wallet.provider,
          network: wallet.network,
          chainId: wallet.chainId ?? null,
          isConnecting: false,
          disconnectPending: false,
        }),
      disconnect: () =>
        set({
          address: null,
          provider: null,
          network: null,
          chainId: null,
          isConnecting: false,
          bsvAddress: null,
          bsvMnemonic: null,
          disconnectPending: false,
        }),
      requestDisconnect: () => set({ disconnectPending: true }),
      cancelDisconnect: () => set({ disconnectPending: false }),
      setConnecting: (isConnecting) => set({ isConnecting }),
      setBsvWallet: (bsvAddress, bsvMnemonic) => set({ bsvAddress, bsvMnemonic }),
    }),
    { name: 'aura-dex-wallet' }
  )
);
