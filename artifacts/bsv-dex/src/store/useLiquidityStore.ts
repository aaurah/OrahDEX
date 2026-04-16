import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PositionEntry {
  lpTokens: number;
  depositedValueUsd: number;
  depositedAt: number;
  txHash?: string;
  chainId?: number;
  /** OrahDEX LP token contract address (pair address) — set when AMM is deployed on-chain */
  lpTokenAddress?: string;
}

interface LiquidityState {
  positions: Record<string, Record<string, PositionEntry>>;
  addPosition: (
    walletAddress: string,
    poolId: string,
    lpTokens: number,
    valueUsd: number,
    meta?: { txHash?: string; chainId?: number; lpTokenAddress?: string }
  ) => void;
  removePositionPct: (walletAddress: string, poolId: string, pct: number) => void;
  removePosition: (walletAddress: string, poolId: string) => void;
  clearWalletPositions: (walletAddress: string) => void;
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
                  lpTokenAddress:    meta?.lpTokenAddress ?? existing?.lpTokenAddress,
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

      removePosition: (walletAddress, poolId) =>
        set((state) => {
          const walletPos = { ...(state.positions[walletAddress] ?? {}) };
          delete walletPos[poolId];
          return { positions: { ...state.positions, [walletAddress]: walletPos } };
        }),

      clearWalletPositions: (walletAddress) =>
        set((state) => {
          const next = { ...state.positions };
          delete next[walletAddress];
          return { positions: next };
        }),

      getUserPositions: (walletAddress) =>
        get().positions[walletAddress] ?? {},
    }),
    { name: "orahdex-liquidity-positions" }
  )
);
