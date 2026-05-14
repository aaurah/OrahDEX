import { create } from 'zustand';

interface WalletModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useWalletModalStore = create<WalletModalState>(() => ({
  isOpen: false,
  open: () => {
    import('@/lib/reown').then(({ modal }) => modal.open({ view: 'Connect' }));
  },
  close: () => {
    import('@/lib/reown').then(({ modal }) => modal.close());
  },
}));
