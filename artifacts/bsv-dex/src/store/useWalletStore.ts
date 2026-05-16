import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WalletNetwork = 'bsv' | 'bsv-test' | 'evm' | 'sol' | 'btc' | 'tron' | 'bch' | 'xrp' | 'ltc' | 'doge';

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
  /** XRP address for HD-wallet users (m/44'/144'/0'/0/0 — secp256k1, XRP Base58 alphabet). */
  internalXrpAddress: string | null;
  /** LTC address for HD-wallet users (m/44'/2'/0'/0/0 — P2PKH version 0x30, starts with "L"). */
  internalLtcAddress: string | null;
  /** DOGE address for HD-wallet users (m/44'/3'/0'/0/0 — P2PKH version 0x1E, starts with "D"). */
  internalDogeAddress: string | null;
  /** TRON address for HD-wallet users (same secp256k1 key as EVM, Tron Base58Check 0x41 prefix → "T…"). */
  internalTronAddress: string | null;

  /** True when the connected wallet is a hardware device (Ledger, Trezor, etc.) */
  isHardwareWallet: boolean;
  /** Which hardware wallet family is connected */
  hardwareWalletType: "ledger" | "trezor" | "keystone" | "gridplus" | null;
  /** BIP-44 derivation path used to select the hardware wallet account */
  hardwareWalletPath: string | null;

  connect: (wallet: ConnectedWallet) => void;
  disconnect: () => void;
  setConnecting: (connecting: boolean) => void;
  setBalance: (balance: string | null) => void;
  setHardwareWallet: (type: "ledger" | "trezor" | "keystone" | "gridplus" | null, path?: string | null) => void;
  /** Unconfirmed (mempool) BSV in BSV units — set by useBsvBalance, 0 when none. */
  bsvUnconfirmed: number;
  setBsvUnconfirmed: (v: number) => void;
  setInternalEvmAddress: (addr: string | null) => void;
  setInternalBsvAddress: (addr: string | null) => void;
  setInternalBchAddress: (addr: string | null) => void;
  setInternalBtcAddress: (addr: string | null) => void;
  setInternalSolAddress: (addr: string | null) => void;
  setInternalXrpAddress: (addr: string | null) => void;
  setInternalLtcAddress: (addr: string | null) => void;
  setInternalDogeAddress: (addr: string | null) => void;
  setInternalTronAddress: (addr: string | null) => void;
  /** Switch the active network for multi-chain wallets (HD/passkey). */
  switchNetworkType: (network: WalletNetwork) => void;
  /**
   * Update ONLY the EVM chainId — used by ChainSwitcherDropdown so it never
   * wipes internal addresses the way connect() does.
   */
  switchChain: (chainId: number) => void;

  addPendingTx: (tx: PendingTx) => void;
  updateTx: (hash: string, update: Partial<PendingTx>) => void;
  removeTx: (hash: string) => void;
  clearConfirmedTxs: () => void;

  /**
   * Increment this counter to signal all balance hooks to re-fetch on-chain
   * balances immediately (e.g. after a trade or liquidity action settles).
   */
  balanceRefreshKey: number;
  triggerBalanceRefresh: () => void;
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
      internalEvmAddress: null,
      internalBsvAddress: null,
      internalBchAddress: null,
      internalBtcAddress: null,
      internalSolAddress: null,
      internalXrpAddress: null,
      internalLtcAddress: null,
      internalDogeAddress: null,
      internalTronAddress: null,
      balanceRefreshKey: 0,
      bsvUnconfirmed: 0,
      isHardwareWallet:   false,
      hardwareWalletType: null,
      hardwareWalletPath: null,

      connect: (wallet) =>
        set((s) => {
          // If reconnecting with the same provider and same primary address (e.g. chain
          // switch via Reown), preserve all internal addresses so the provisioning hooks
          // don't fire again and overwrite them with new custodial keypairs.
          const sameProvider = s.provider === wallet.provider;
          const sameAddress  = s.address  === wallet.address;
          const sameNetwork = s.network === wallet.network;
          const isNetworkSwitchOnSameWallet = sameProvider && sameAddress && !sameNetwork;
          return {
            address:   wallet.address,
            provider:  wallet.provider,
            network:   wallet.network,
            chainId:   wallet.chainId ?? null,
            balance:   isNetworkSwitchOnSameWallet ? null : (wallet.balance ?? null),
            isConnecting: false,
            // Preserve internals on same-provider reconnect (chain switch); reset on new wallet
            internalEvmAddress:  sameProvider && sameAddress ? s.internalEvmAddress  : null,
            internalBsvAddress:  sameProvider && sameAddress ? s.internalBsvAddress  : null,
            internalBchAddress:  sameProvider && sameAddress ? s.internalBchAddress  : null,
            internalBtcAddress:  sameProvider && sameAddress ? s.internalBtcAddress  : null,
            internalSolAddress:  sameProvider && sameAddress ? s.internalSolAddress  : null,
            internalXrpAddress:  sameProvider && sameAddress ? s.internalXrpAddress  : null,
            internalLtcAddress:  sameProvider && sameAddress ? s.internalLtcAddress  : null,
            internalDogeAddress: sameProvider && sameAddress ? s.internalDogeAddress : null,
            internalTronAddress: sameProvider && sameAddress ? s.internalTronAddress : null,
          };
        }),

      disconnect: () =>
        set({
          address: null,
          provider: null,
          network: null,
          chainId: null,
          balance: null,
          isConnecting: false,
          internalEvmAddress: null,
          internalBsvAddress: null,
          internalBchAddress: null,
          internalBtcAddress: null,
          internalSolAddress: null,
          internalXrpAddress: null,
          internalLtcAddress: null,
          internalDogeAddress: null,
          internalTronAddress: null,
          isHardwareWallet:   false,
          hardwareWalletType: null,
          hardwareWalletPath: null,
        }),

      setConnecting: (isConnecting) => set({ isConnecting }),
      setBalance: (balance) => set({ balance }),
      setHardwareWallet: (type, path = null) => set({ isHardwareWallet: !!type, hardwareWalletType: type, hardwareWalletPath: path ?? null }),
      setBsvUnconfirmed: (bsvUnconfirmed) => set({ bsvUnconfirmed }),
      setInternalEvmAddress:  (internalEvmAddress)  => set({ internalEvmAddress }),
      setInternalBsvAddress:  (internalBsvAddress)  => set({ internalBsvAddress }),
      setInternalBchAddress:  (internalBchAddress)  => set({ internalBchAddress }),
      setInternalBtcAddress:  (internalBtcAddress)  => set({ internalBtcAddress }),
      setInternalSolAddress:  (internalSolAddress)  => set({ internalSolAddress }),
      setInternalXrpAddress:  (internalXrpAddress)  => set({ internalXrpAddress }),
      setInternalLtcAddress:  (internalLtcAddress)  => set({ internalLtcAddress }),
      setInternalDogeAddress: (internalDogeAddress) => set({ internalDogeAddress }),
      setInternalTronAddress: (internalTronAddress) => set({ internalTronAddress }),

      /**
       * switchChain — update ONLY the EVM chainId.
       * Does NOT touch address, provider, network, or any internal addresses.
       * Use this for EVM chain switching to avoid triggering re-provisioning.
       */
      switchChain: (chainId) => set({ chainId, balance: null }),

      switchNetworkType: (network) =>
        set((s) => {
          // For each network type, the "authoritative" address is either the
          // stored internal address OR the current live address if that network
          // is already active. This lets native wallets (SOL, BTC, BCH, XRP, LTC
          // connected directly) round-trip through other networks and come back.
          const evmAddr  = s.internalEvmAddress  ?? (s.network === 'evm'                               ? s.address : null);
          const bsvAddr  = s.internalBsvAddress   ?? (s.network === 'bsv' || s.network === 'bsv-test'  ? s.address : null);
          const solAddr  = s.internalSolAddress   ?? (s.network === 'sol'                               ? s.address : null);
          const btcAddr  = s.internalBtcAddress   ?? (s.network === 'btc'                               ? s.address : null);
          const bchAddr  = s.internalBchAddress   ?? (s.network === 'bch'                               ? s.address : null);
          const xrpAddr  = s.internalXrpAddress   ?? (s.network === 'xrp'                               ? s.address : null);
          const ltcAddr  = s.internalLtcAddress   ?? (s.network === 'ltc'                               ? s.address : null);
          const dogeAddr = s.internalDogeAddress  ?? (s.network === 'doge'                              ? s.address : null);
          const tronAddr = s.internalTronAddress  ?? (s.network === 'tron'                              ? s.address : null);

          let newAddress: string | null = null;
          if (network === 'evm')       newAddress = evmAddr;
          if (network === 'bsv')       newAddress = bsvAddr;
          if (network === 'bsv-test')  newAddress = bsvAddr; // same keypair, testnet params
          if (network === 'btc')       newAddress = btcAddr;
          if (network === 'sol')       newAddress = solAddr;
          if (network === 'bch')       newAddress = bchAddr;
          if (network === 'xrp')       newAddress = xrpAddr;
          if (network === 'ltc')       newAddress = ltcAddr;
          if (network === 'doge')      newAddress = dogeAddr;
          if (network === 'tron')      newAddress = tronAddr;
          if (!newAddress) return {}; // no address available for this network — no-op
          return {
            network,
            address: newAddress,
            balance: null,
            chainId: null,
            // Explicitly carry provider forward so it is never dropped by any
            // render-batching edge case — the NFT profile guard relies on it.
            provider: s.provider,
            // Persist all known addresses so round-trips always work
            internalEvmAddress:  evmAddr,
            internalBsvAddress:  bsvAddr,
            internalSolAddress:  solAddr,
            internalBtcAddress:  btcAddr,
            internalBchAddress:  bchAddr,
            internalXrpAddress:  xrpAddr,
            internalLtcAddress:  ltcAddr,
            internalDogeAddress: dogeAddr,
            internalTronAddress: tronAddr,
          };
        }),

      triggerBalanceRefresh: () =>
        set((s) => ({ balanceRefreshKey: s.balanceRefreshKey + 1 })),

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
    {
      name: 'orah-wallet',
      // v1: strip the `balance` field from any previously-persisted state.
      // Before the non-custodial refactor the store held an internal-ledger balance
      // (e.g. 1,472 ETH) that must never be shown to users again.
      // `balance` is always derived from on-chain polling (useEvmBalances / useBsvBalance)
      // so there is no reason to persist it at all.
      version: 1,
      migrate: (persisted: any) => {
        const { balance: _dropped, ...rest } = persisted ?? {};
        return { ...rest, balance: null };
      },
      partialize: (state) => {
        // Exclude `balance` from storage — it is always fetched live on mount.
        const { balance: _b, ...rest } = state as any;
        return rest;
      },
    }
  )
);
