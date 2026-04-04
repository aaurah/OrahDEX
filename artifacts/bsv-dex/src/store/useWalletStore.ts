import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WalletNetwork = 'bsv' | 'evm' | 'sol' | 'btc' | 'tron' | 'bch';

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
  isDemo: boolean;
  pendingTxs: PendingTx[];

  /** Auto-provisioned EVM address for BSV-wallet users (custodial sub-account). */
  internalEvmAddress: string | null;
  /** Auto-provisioned BSV address for EVM-wallet users (custodial sub-account).
   *  For HD-wallet users this is the BIP44 m/44'/236'/0'/0/0 BSV address. */
  internalBsvAddress: string | null;
  /** BCH CashAddr — either derived from the custodial key or from m/44'/145'/0'/0/0. */
  internalBchAddress: string | null;
  /** BTC address for HD-wallet users (m/44'/0'/0'/0/0 — different from BSV path). */
  internalBtcAddress: string | null;
  /** SOL address for HD-wallet users (SLIP-0010 ed25519 m/44'/501'/0'/0' — Phantom-compatible). */
  internalSolAddress: string | null;

  connect: (wallet: ConnectedWallet) => void;
  connectDemo: (address: string) => void;
  disconnect: () => void;
  setConnecting: (connecting: boolean) => void;
  setBalance: (balance: string | null) => void;
  setInternalEvmAddress: (addr: string | null) => void;
  setInternalBsvAddress: (addr: string | null) => void;
  setInternalBchAddress: (addr: string | null) => void;
  setInternalBtcAddress: (addr: string | null) => void;
  setInternalSolAddress: (addr: string | null) => void;
  /** Switch the active network for multi-chain wallets (HD/passkey). */
  switchNetworkType: (network: WalletNetwork) => void;

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
      isDemo: false,
      pendingTxs: [],
      internalEvmAddress: null,
      internalBsvAddress: null,
      internalBchAddress: null,
      internalBtcAddress: null,
      internalSolAddress: null,

      connect: (wallet) =>
        set({
          address: wallet.address,
          provider: wallet.provider,
          network: wallet.network,
          chainId: wallet.chainId ?? null,
          balance: wallet.balance ?? null,
          isConnecting: false,
          isDemo: false,
          internalEvmAddress: null,
          internalBsvAddress: null,
          internalBchAddress: null,
          internalBtcAddress: null,
          internalSolAddress: null,
        }),

      connectDemo: (address) =>
        set({
          address,
          provider: "demo",
          network: "evm",
          chainId: null,
          balance: null,
          isConnecting: false,
          isDemo: true,
          internalEvmAddress: null,
          internalBsvAddress: null,
          internalBchAddress: null,
          internalBtcAddress: null,
          internalSolAddress: null,
        }),

      disconnect: () =>
        set({
          address: null,
          provider: null,
          network: null,
          chainId: null,
          balance: null,
          isConnecting: false,
          isDemo: false,
          internalEvmAddress: null,
          internalBsvAddress: null,
          internalBchAddress: null,
          internalBtcAddress: null,
          internalSolAddress: null,
        }),

      setConnecting: (isConnecting) => set({ isConnecting }),
      setBalance: (balance) => set({ balance }),
      setInternalEvmAddress: (internalEvmAddress) => set({ internalEvmAddress }),
      setInternalBsvAddress: (internalBsvAddress) => set({ internalBsvAddress }),
      setInternalBchAddress: (internalBchAddress) => set({ internalBchAddress }),
      setInternalBtcAddress: (internalBtcAddress) => set({ internalBtcAddress }),
      setInternalSolAddress: (internalSolAddress) => set({ internalSolAddress }),

      switchNetworkType: (network) =>
        set((s) => {
          // When switching away from EVM, capture the EVM address so we can return to it later
          const evmAddr = s.internalEvmAddress ?? (s.network === 'evm' ? s.address : null);
          // Resolve the address for the requested network using stored internal addresses
          let newAddress: string | null = null;
          if (network === 'evm')  newAddress = evmAddr;
          if (network === 'bsv')  newAddress = s.internalBsvAddress;
          if (network === 'btc')  newAddress = s.internalBtcAddress;
          if (network === 'sol')  newAddress = s.internalSolAddress;
          if (network === 'bch')  newAddress = s.internalBchAddress;
          if (!newAddress) return {}; // no address available for this network — no-op
          return {
            network,
            address: newAddress,
            balance: null,
            chainId: null,
            // Persist EVM address so we can switch back
            internalEvmAddress: evmAddr,
          };
        }),

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
