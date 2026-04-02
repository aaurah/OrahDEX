import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WalletNetwork = 'bsv' | 'evm' | 'sol' | 'btc' | 'tron';

export interface ConnectedWallet {
  address: string;
  provider: string;
  network: WalletNetwork;
  chainId?: number;
  balance?: string;
}

export type TxStatus = 'pending' | 'confirmed' | 'failed' | 'dropped';

export interface PendingTx {
  hash: string;
  chainId: number;
  label: string;
  status: TxStatus;
  confirmations: number;
  requiredConfirmations: number;
  timestamp: number;
  explorerUrl: string;
  blockNumber?: number;
}

interface WalletState {
  address: string | null;
  provider: string | null;
  network: WalletNetwork | null;
  chainId: number | null;
  balance: string | null;
  isConnecting: boolean;
  pendingTxs: PendingTx[];

  connect: (wallet: ConnectedWallet) => void;
  disconnect: () => void;
  setConnecting: (connecting: boolean) => void;
  setBalance: (balance: string | null) => void;

  addPendingTx: (tx: PendingTx) => void;
  updateTx: (hash: string, update: Partial<PendingTx>) => void;
  removeTx: (hash: string) => void;
  clearConfirmedTxs: () => void;
}

const BLOCK_EXPLORER_URLS: Record<number, string> = {
  1:      "https://etherscan.io/tx/",
  56:     "https://bscscan.com/tx/",
  137:    "https://polygonscan.com/tx/",
  42161:  "https://arbiscan.io/tx/",
  10:     "https://optimistic.etherscan.io/tx/",
  8453:   "https://basescan.org/tx/",
  59144:  "https://lineascan.build/tx/",
  324:    "https://explorer.zksync.io/tx/",
  534352: "https://scrollscan.com/tx/",
  5000:   "https://explorer.mantle.xyz/tx/",
  43114:  "https://snowtrace.io/tx/",
  250:    "https://ftmscan.com/tx/",
  25:     "https://cronoscan.com/tx/",
};

export function getTxExplorerUrl(hash: string, chainId: number): string {
  const base = BLOCK_EXPLORER_URLS[chainId] ?? "https://etherscan.io/tx/";
  return `${base}${hash}`;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      address: null,
      provider: null,
      network: null,
      chainId: null,
      balance: null,
      isConnecting: false,
      pendingTxs: [],

      connect: (wallet) =>
        set({
          address: wallet.address,
          provider: wallet.provider,
          network: wallet.network,
          chainId: wallet.chainId ?? null,
          balance: wallet.balance ?? null,
          isConnecting: false,
        }),

      disconnect: () =>
        set({
          address: null,
          provider: null,
          network: null,
          chainId: null,
          balance: null,
          isConnecting: false,
        }),

      setConnecting: (isConnecting) => set({ isConnecting }),
      setBalance: (balance) => set({ balance }),

      addPendingTx: (tx) =>
        set((s) => ({ pendingTxs: [tx, ...s.pendingTxs.slice(0, 9)] })),

      updateTx: (hash, update) =>
        set((s) => ({
          pendingTxs: s.pendingTxs.map((tx) =>
            tx.hash === hash ? { ...tx, ...update } : tx
          ),
        })),

      removeTx: (hash) =>
        set((s) => ({ pendingTxs: s.pendingTxs.filter((tx) => tx.hash !== hash) })),

      clearConfirmedTxs: () =>
        set((s) => ({
          pendingTxs: s.pendingTxs.filter((tx) => tx.status === 'pending'),
        })),
    }),
    { name: 'aura-dex-wallet' }
  )
);
