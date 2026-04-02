import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PositionEntry {
  lpTokens: number;
  depositedValueUsd: number;
  depositedAt: number;
  txHash?: string;
  chainId?: number;
}

interface LiquidityState {
  positions: Record<string, Record<string, PositionEntry>>;
  addPosition: (
    walletAddress: string,
    poolId: string,
    lpTokens: number,
    valueUsd: number,
    meta?: { txHash?: string; chainId?: number }
  ) => void;
  removePositionPct: (walletAddress: string, poolId: string, pct: number) => void;
  getUserPositions: (walletAddress: string) => Record<string, PositionEntry>;
}

export const useLiquidityStore = create<LiquidityState>()(
  persist(
    (set, get) => ({
      positions: {},

      addPosition: (walletAddress, poolId, lpTokens, valueUsd, meta) =>
        set((state) => {
          const walletPos = state.positions[walletAddress] ?? {};
          const existing  = walletPos[poolId];
          return {
            positions: {
              ...state.positions,
              [walletAddress]: {
                ...walletPos,
                [poolId]: {
                  lpTokens:          (existing?.lpTokens ?? 0) + lpTokens,
                  depositedValueUsd: (existing?.depositedValueUsd ?? 0) + valueUsd,
                  depositedAt:       existing?.depositedAt ?? Date.now(),
                  txHash:            meta?.txHash ?? existing?.txHash,
                  chainId:           meta?.chainId ?? existing?.chainId,
                },
              },
            },
          };
        }),

      removePositionPct: (walletAddress, poolId, pct) =>
        set((state) => {
          const walletPos = { ...(state.positions[walletAddress] ?? {}) };
          const current   = walletPos[poolId];
          if (!current) return state;
          const remaining = current.lpTokens * (1 - pct / 100);
          if (remaining < 0.0001) {
            delete walletPos[poolId];
          } else {
            walletPos[poolId] = {
              ...current,
              lpTokens:          remaining,
              depositedValueUsd: current.depositedValueUsd * (1 - pct / 100),
            };
          }
          return {
            positions: {
              ...state.positions,
              [walletAddress]: walletPos,
            },
          };
        }),

      getUserPositions: (walletAddress) =>
        get().positions[walletAddress] ?? {},
    }),
    { name: "orahdex-liquidity-positions" }
  )
);
