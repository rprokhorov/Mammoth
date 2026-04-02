import { create } from "zustand";

export interface Tab {
  id: string; // unique tab id (= channelId)
  channelId: string;
  unreadCount: number;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;

  openTab: (channelId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  /** Update the first (default) tab to show a different channel and activate it */
  navigateDefaultTab: (channelId: string) => void;
  incrementTabUnread: (channelId: string) => void;
  clearTabUnread: (tabId: string) => void;
  hasTab: (channelId: string) => boolean;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (channelId: string) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.channelId === channelId);
    if (existing) {
      // Already open — just activate
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: Tab = {
      id: channelId,
      channelId,
      unreadCount: 0,
    };
    set({ tabs: [...tabs, newTab], activeTabId: newTab.id });
  },

  navigateDefaultTab: (channelId: string) => {
    const { tabs } = get();
    // If this channel is already open in some tab, just activate it
    const existing = tabs.find((t) => t.channelId === channelId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    // Otherwise, replace the first tab's channel
    if (tabs.length === 0) {
      // No tabs yet — create one
      const newTab: Tab = { id: channelId, channelId, unreadCount: 0 };
      set({ tabs: [newTab], activeTabId: newTab.id });
      return;
    }
    const defaultTab = tabs[0];
    const updated: Tab = { ...defaultTab, id: channelId, channelId, unreadCount: 0 };
    set({
      tabs: [updated, ...tabs.slice(1)],
      activeTabId: updated.id,
    });
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return; // don't close last tab

    const idx = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);

    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
      // Activate the next tab, or previous if closing the last
      const newIdx = Math.min(idx, newTabs.length - 1);
      newActiveId = newTabs[newIdx]?.id ?? null;
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  incrementTabUnread: (channelId: string) => {
    const { tabs, activeTabId } = get();
    // Only increment if the tab exists and is NOT the active tab
    const tab = tabs.find((t) => t.channelId === channelId);
    if (!tab || tab.id === activeTabId) return;

    set({
      tabs: tabs.map((t) =>
        t.channelId === channelId
          ? { ...t, unreadCount: t.unreadCount + 1 }
          : t,
      ),
    });
  },

  clearTabUnread: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, unreadCount: 0 } : t,
      ),
    }));
  },

  hasTab: (channelId: string) => {
    return get().tabs.some((t) => t.channelId === channelId);
  },
}));
