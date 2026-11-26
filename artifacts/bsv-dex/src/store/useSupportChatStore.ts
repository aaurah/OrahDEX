import { create } from "zustand";

interface SupportChatState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

export const useSupportChatStore = create<SupportChatState>(set => ({
  unreadCount: 0,
  setUnreadCount: count => set({ unreadCount: Math.max(0, count) }),
}));
