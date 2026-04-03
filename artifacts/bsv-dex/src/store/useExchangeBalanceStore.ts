/**
 * OrahDEX Exchange Balance
 *
 * Tracks virtual token balances that accumulate from matched trades inside
 * the OrahDEX order book. These are separate from on-chain wallet balances.
 *
 * When a SELL ETH/USDT order fills at price P:
 *   - USDT balance += quantity * P * (1 - fee)
 *   - ETH  balance -= quantity   (optional debit tracking)
 *
 * When a BUY ETH/USDT order fills at price P:
 *   - ETH  balance += quantity * (1 - fee)
 *   - USDT balance -= quantity * P  (optional debit tracking)
 *
 * Persisted to localStorage so balances survive page refreshes.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ExchangeBalances {
  [token: string]: number; // e.g. { ETH: 0.05, USDT: 120.5 }
}

interface ExchangeBalanceState {
  balances: Record<string, ExchangeBalances>; // walletAddress → token balances
  credit: (walletAddress: string, token: string, amount: number) => void;
  debit:  (walletAddress: string, token: string, amount: number) => void;
  applyFill: (
    walletAddress: string,
    side: "buy" | "sell",
    base: string,
    quote: string,
    quantity: number,
    fillPrice: number,
    feePct?: number,
  ) => void;
  getBalances: (walletAddress: string) => ExchangeBalances;
  getBalance:  (walletAddress: string, token: string) => number;
  reset: (walletAddress: string) => void;
}

const FEE = 0.001; // 0.1% taker fee

export const useExchangeBalanceStore = create<ExchangeBalanceState>()(
  persist(
    (set, get) => ({
      balances: {},

      credit: (addr, token, amount) =>
        set(s => ({
          balances: {
            ...s.balances,
            [addr]: {
              ...s.balances[addr],
              [token]: (s.balances[addr]?.[token] ?? 0) + amount,
            },
          },
        })),

      debit: (addr, token, amount) =>
        set(s => ({
          balances: {
            ...s.balances,
            [addr]: {
              ...s.balances[addr],
              [token]: Math.max(0, (s.balances[addr]?.[token] ?? 0) - amount),
            },
          },
        })),

      applyFill: (addr, side, base, quote, quantity, fillPrice, feePct = FEE) => {
        const quoteAmount = quantity * fillPrice;
        if (side === "sell") {
          // Seller gives base, receives quote minus fee
          get().credit(addr, quote, quoteAmount * (1 - feePct));
          get().debit(addr, base, quantity);
        } else {
          // Buyer gives quote, receives base minus fee
          get().credit(addr, base, quantity * (1 - feePct));
          get().debit(addr, quote, quoteAmount);
        }
      },

      getBalances: (addr) => get().balances[addr] ?? {},

      getBalance: (addr, token) => get().balances[addr]?.[token] ?? 0,

      reset: (addr) =>
        set(s => {
          const next = { ...s.balances };
          delete next[addr];
          return { balances: next };
        }),
    }),
    { name: "orahdex-exchange-balances-v1" }
  )
);
