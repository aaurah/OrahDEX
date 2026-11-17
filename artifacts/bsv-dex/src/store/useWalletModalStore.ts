import { create } from 'zustand';

interface WalletModalState {
  isOpen: boolean;
  isOrahWalletOpen: boolean;
  initialTab: "choose" | "handcash";
  handCashLinkOnly: boolean;

  open: () => void;
  openHandCashForLink: () => void;
  close: () => void;

  openOrahWallet: () => void;
  closeOrahWallet: () => void;
}

export const useWalletModalStore = create<WalletModalState>(() => ({
  isOpen: false,
  isOrahWalletOpen: false,
  initialTab: "choose",
  handCashLinkOnly: false,

  open: () => useWalletModalStore.setState({ isOpen: true, initialTab: "choose", handCashLinkOnly: false }),
  openHandCashForLink: () => useWalletModalStore.setState({ isOpen: true, initialTab: "handcash", handCashLinkOnly: true }),
  close: () => useWalletModalStore.setState({ isOpen: false, initialTab: "choose", handCashLinkOnly: false }),

  openOrahWallet: () => useWalletModalStore.setState({ isOrahWalletOpen: true }),
  closeOrahWallet: () => useWalletModalStore.setState({ isOrahWalletOpen: false }),
}));
