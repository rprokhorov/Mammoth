import { create } from "zustand";

export interface ReactionNotification {
  id: string; // unique id for the notification
  postId: string;
  channelId: string;
  emojiName: string;
  reactorUserId: string;
  postAuthorUserId: string;
  postMessage: string;
  createAt: number;
  read: boolean;
}

interface ReactionsState {
  notifications: ReactionNotification[];
  unreadCount: number;
  addNotification: (notification: ReactionNotification) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

export const useReactionsStore = create<ReactionsState>((set) => ({
  notifications: [],
  unreadCount: 0,
  addNotification: (notification) =>
    set((state) => {
      const notifications = [notification, ...state.notifications].slice(0, 200);
      const unreadCount = notifications.filter((n) => !n.read).length;
      return { notifications, unreadCount };
    }),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));
