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

  open: () => useWalletModalStore.setState({ isOpen: true }),
  close: () => useWalletModalStore.setState({ isOpen: false }),

  openOrahWallet: () => useWalletModalStore.setState({ isOrahWalletOpen: true }),
  closeOrahWallet: () => useWalletModalStore.setState({ isOrahWalletOpen: false }),
}));
