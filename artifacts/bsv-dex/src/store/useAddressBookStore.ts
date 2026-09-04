import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WalletType = "personal" | "cold" | "hardware" | "exchange" | "other";

export interface AddressBookEntry {
  id:         string;
  nickname:   string;
  address:    string;
  chain:      string;
  walletType: WalletType;
  createdAt:  number;
}

export const WALLET_TYPE_META: Record<WalletType, { label: string; icon: string; color: string }> = {
  personal: { label: "Personal",  icon: "👤", color: "text-blue-400 bg-blue-400/10 border-blue-400/20"   },
  cold:     { label: "Cold",      icon: "🧊", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20"    },
  hardware: { label: "Hardware",  icon: "🔑", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  exchange: { label: "Exchange",  icon: "🏦", color: "text-green-400 bg-green-400/10 border-green-400/20" },
  other:    { label: "Other",     icon: "📋", color: "text-muted-foreground bg-muted/40 border-border"    },
};

interface AddressBookState {
  entries: AddressBookEntry[];
  add:    (entry: Omit<AddressBookEntry, "id" | "createdAt">) => void;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<Omit<AddressBookEntry, "id" | "createdAt">>) => void;
  getByChain: (chain: string) => AddressBookEntry[];
}

export const useAddressBookStore = create<AddressBookState>()(
  persist(
    (set, get) => ({
      entries: [],

      add: (entry) => set(s => ({
        entries: [
          ...s.entries,
          { ...entry, id: crypto.randomUUID(), createdAt: Date.now() },
        ],
      })),

      remove: (id) => set(s => ({ entries: s.entries.filter(e => e.id !== id) })),

      update: (id, patch) => set(s => ({
        entries: s.entries.map(e => e.id === id ? { ...e, ...patch } : e),
      })),

      getByChain: (chain) =>
        get().entries.filter(e => e.chain.toUpperCase() === chain.toUpperCase()),
    }),
    { name: "orahdex_address_book_v1" },
  ),
);
