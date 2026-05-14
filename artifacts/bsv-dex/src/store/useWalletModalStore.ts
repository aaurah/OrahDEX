import { create } from 'zustand';

interface WalletModalState {
  isOpen: boolean;
  isOrahWalletOpen: boolean;
  open: () => void;
  close: () => void;
  openOrahWallet: () => void;
  closeOrahWallet: () => void;
}

export const useWalletModalStore = create<WalletModalState>(() => ({
  isOpen: false,
  isOrahWalletOpen: false,
  open: () => {
    import('@/lib/reown').then(({ modal }) => modal.open({ view: 'Connect' }));
  },
  close: () => {
    import('@/lib/reown').then(({ modal }) => modal.close());
  },
  openOrahWallet: () => useWalletModalStore.setState({ isOrahWalletOpen: true }),
  closeOrahWallet: () => useWalletModalStore.setState({ isOrahWalletOpen: false }),
}));
