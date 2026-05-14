import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TicketReadState {
  readIds: number[];
  adminUnreadCount: number;

  markRead: (id: number) => void;
  markAllRead: (ids: number[]) => void;
  isRead: (id: number) => boolean;
  setAdminUnreadCount: (n: number) => void;
}

export const useTicketReadStore = create<TicketReadState>()(
  persist(
    (set, get) => ({
      readIds: [],
      adminUnreadCount: 0,

      markRead: (id) => {
        const { readIds } = get();
        if (readIds.includes(id)) return;
        set({ readIds: [...readIds, id] });
      },

      markAllRead: (ids) => {
        const { readIds } = get();
        const merged = Array.from(new Set([...readIds, ...ids]));
        set({ readIds: merged });
      },

      isRead: (id) => get().readIds.includes(id),

      setAdminUnreadCount: (n) => set({ adminUnreadCount: n }),
    }),
    {
      name: "orah_ticket_read_v1",
      partialize: (s) => ({ readIds: s.readIds }),
    },
  ),
);
