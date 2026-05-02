import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotifType =
  | "order_placed"
  | "order_filled"
  | "order_cancelled"
  | "trade"
  | "bridge"
  | "price_alert"
  | "wallet_connected"
  | "wallet_disconnected"
  | "withdrawal"
  | "liquidity"
  | "support"
  | "support_reply"
  | "info"
  | "warning"
  | "success"
  | "error"
  | "deposit";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  txid?: string;
  pair?: string;
  amount?: string;
  side?: "buy" | "sell";
  href?: string;
}

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, "id" | "timestamp" | "read">) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  unreadCount: () => number;
}

let _idCounter = 0;
function genId() {
  return `notif_${Date.now()}_${++_idCounter}`;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],

      addNotification: (n) => {
        const entry: AppNotification = {
          ...n,
          id: genId(),
          timestamp: Date.now(),
          read: false,
        };
        set((s) => ({
          notifications: [entry, ...s.notifications].slice(0, 100),
        }));
      },

      markRead: (id) => {
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          ),
        }));
      },

      markAllRead: () => {
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        }));
      },

      clearAll: () => set({ notifications: [] }),

      unreadCount: () => get().notifications.filter((n) => !n.read).length,
    }),
    {
      name: "orahdex_notifs_v4",
      partialize: (s) => ({ notifications: s.notifications.slice(0, 50) }),
    },
  ),
);
