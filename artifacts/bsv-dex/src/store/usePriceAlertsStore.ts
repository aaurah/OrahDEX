import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AlertCondition = "above" | "below";

export interface PriceAlert {
  id: string;
  symbol: string;          // e.g. "BTC", "BSV", "ETH"
  condition: AlertCondition;
  target: number;          // USD price
  createdAt: number;
  triggeredAt: number | null;
  lastSeenPrice: number | null;
}

interface PriceAlertsState {
  enabled: boolean;
  alerts: PriceAlert[];
  setEnabled: (v: boolean) => void;
  addAlert: (a: Omit<PriceAlert, "id" | "createdAt" | "triggeredAt" | "lastSeenPrice">) => void;
  removeAlert: (id: string) => void;
  markTriggered: (id: string, price: number) => void;
  resetAlert: (id: string) => void;
  clearAll: () => void;
  activeCount: () => number;
}

let _id = 0;
const genId = () => `alert_${Date.now()}_${++_id}`;

export const usePriceAlertsStore = create<PriceAlertsState>()(
  persist(
    (set, get) => ({
      enabled: true,
      alerts: [],

      setEnabled: (v) => set({ enabled: v }),

      addAlert: (a) =>
        set((s) => ({
          alerts: [
            {
              ...a,
              id: genId(),
              createdAt: Date.now(),
              triggeredAt: null,
              lastSeenPrice: null,
            },
            ...s.alerts,
          ].slice(0, 50),
        })),

      removeAlert: (id) =>
        set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id) })),

      markTriggered: (id, price) =>
        set((s) => ({
          alerts: s.alerts.map((x) =>
            x.id === id ? { ...x, triggeredAt: Date.now(), lastSeenPrice: price } : x,
          ),
        })),

      resetAlert: (id) =>
        set((s) => ({
          alerts: s.alerts.map((x) =>
            x.id === id ? { ...x, triggeredAt: null, lastSeenPrice: null } : x,
          ),
        })),

      clearAll: () => set({ alerts: [] }),

      activeCount: () => get().alerts.filter((a) => a.triggeredAt === null).length,
    }),
    { name: "orahdex_price_alerts_v1" },
  ),
);
