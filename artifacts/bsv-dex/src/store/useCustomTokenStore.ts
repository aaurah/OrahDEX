import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CustomToken {
  id: string;
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  color: string;
  addedAt: number;
  isAutoDiscovered?: boolean;
}

interface CustomTokenStore {
  tokens: CustomToken[];
  add: (token: Omit<CustomToken, "id" | "addedAt">) => CustomToken | null;
  addAutoDiscovered: (tokens: Omit<CustomToken, "id" | "addedAt">[]) => void;
  remove: (id: string) => void;
  getByChainId: (chainId: number) => CustomToken[];
}

export const useCustomTokenStore = create<CustomTokenStore>()(
  persist(
    (set, get) => ({
      tokens: [],

      add: (token) => {
        const existing = get().tokens.find(
          t =>
            t.chainId === token.chainId &&
            t.address.toLowerCase() === token.address.toLowerCase(),
        );
        if (existing) return null;
        const entry: CustomToken = {
          ...token,
          id: `${token.chainId}_${token.address.toLowerCase()}`,
          addedAt: Date.now(),
        };
        set(s => ({ tokens: [...s.tokens, entry] }));
        return entry;
      },

      addAutoDiscovered: (tokens) => {
        const existing = new Set(
          get().tokens.map(t => `${t.chainId}_${t.address.toLowerCase()}`),
        );
        const newEntries = tokens
          .filter(t => !existing.has(`${t.chainId}_${t.address.toLowerCase()}`))
          .map(t => ({
            ...t,
            id:      `${t.chainId}_${t.address.toLowerCase()}`,
            addedAt: Date.now(),
          }));
        if (newEntries.length === 0) return;
        set(s => ({ tokens: [...s.tokens, ...newEntries] }));
      },

      remove: (id) => set(s => ({ tokens: s.tokens.filter(t => t.id !== id) })),

      getByChainId: (chainId) => get().tokens.filter(t => t.chainId === chainId),
    }),
    { name: "orahdex_custom_tokens_v1" },
  ),
);
