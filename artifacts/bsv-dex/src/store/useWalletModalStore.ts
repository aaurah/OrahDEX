import { create } from 'zustand';

type ModalTab = 'real' | 'demo';

interface WalletModalState {
  isOpen: boolean;
  initialTab: ModalTab;
  open: (tab?: ModalTab) => void;
  close: () => void;
}

export const useWalletModalStore = create<WalletModalState>((set) => ({
  isOpen: false,
  initialTab: 'real',
  open: (tab = 'real') => set({ isOpen: true, initialTab: tab }),
  close: () => set({ isOpen: false }),
}));
