import { create } from 'zustand';

interface WalletModalState {
  /** Main chooser dialog (EVM vs OrahDEX picker) */
  isOpen: boolean;
  /** Legacy OrahDEX-only dialog — kept for any direct callers */
  isOrahWalletOpen: boolean;

  /** Open the unified wallet chooser */
  open: () => void;
  close: () => void;

  /** Open the Reown/EVM modal directly (used by the chooser after user picks EVM) */
  openEvm: () => void;

  /** Open the OrahDEX passkey dialog directly */
  openOrahWallet: () => void;
  closeOrahWallet: () => void;
}

export const useWalletModalStore = create<WalletModalState>(() => ({
  isOpen: false,
  isOrahWalletOpen: false,

  open: () => useWalletModalStore.setState({ isOpen: true }),
  close: () => useWalletModalStore.setState({ isOpen: false }),

  openEvm: () => {
    import('@/lib/reown').then(({ modal }) => modal.open({ view: 'Connect' }));
  },

  openOrahWallet: () => useWalletModalStore.setState({ isOrahWalletOpen: true }),
  closeOrahWallet: () => useWalletModalStore.setState({ isOrahWalletOpen: false }),
}));
