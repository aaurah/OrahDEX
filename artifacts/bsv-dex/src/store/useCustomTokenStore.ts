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
}

interface CustomTokenStore {
  tokens: CustomToken[];
  add: (token: Omit<CustomToken, "id" | "addedAt">) => CustomToken | null;
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
      remove: (id) => set(s => ({ tokens: s.tokens.filter(t => t.id !== id) })),
      getByChainId: (chainId) => get().tokens.filter(t => t.chainId === chainId),
    }),
    { name: "orahdex_custom_tokens_v1" },
  ),
);
