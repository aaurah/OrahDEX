import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CustomChain {
  id: number;
  name: string;
  symbol: string;
  nativeName: string;
  rpcUrl: string;
  blockExplorerUrl: string;
  addedAt: number;
}

interface CustomChainStore {
  chains: CustomChain[];
  add: (chain: Omit<CustomChain, "addedAt">) => CustomChain | null;
  remove: (id: number) => void;
  getById: (id: number) => CustomChain | undefined;
}

export const useCustomChainStore = create<CustomChainStore>()(
  persist(
    (set, get) => ({
      chains: [],

      add: (chain) => {
        if (get().chains.find(c => c.id === chain.id)) return null;
        const entry: CustomChain = { ...chain, addedAt: Date.now() };
        set(s => ({ chains: [...s.chains, entry] }));
        return entry;
      },

      remove: (id) => set(s => ({ chains: s.chains.filter(c => c.id !== id) })),

      getById: (id) => get().chains.find(c => c.id === id),
    }),
    { name: "orahdex_custom_chains_v1" },
  ),
);
