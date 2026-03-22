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
  // Auto-created BSV wallet (for EVM-connected users who need BSV to trade)
  bsvAddress: string | null;
  bsvMnemonic: string[] | null;
  connect: (wallet: ConnectedWallet) => void;
  disconnect: () => void;
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
          bsvAddress: null,
          bsvMnemonic: null,
        }),
      setConnecting: (isConnecting) => set({ isConnecting }),
      setBsvWallet: (bsvAddress, bsvMnemonic) => set({ bsvAddress, bsvMnemonic }),
    }),
    { name: 'aura-dex-wallet' }
  )
);
