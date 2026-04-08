import { create } from "zustand";

let tabCounter = 0;
function newTabId() {
  return `tab-${++tabCounter}`;
}

export interface Tab {
  id: string;
  channelId: string;
  unreadCount: number;
  isDefault?: boolean;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;

  openTab: (channelId: string) => void;
  openNewTab: (channelId: string) => void;
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
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: Tab = { id: newTabId(), channelId, unreadCount: 0 };
    set({ tabs: [...tabs, newTab], activeTabId: newTab.id });
  },

  openNewTab: (channelId: string) => {
    const { tabs } = get();
    const newTab: Tab = { id: newTabId(), channelId, unreadCount: 0 };
    set({ tabs: [...tabs, newTab], activeTabId: newTab.id });
  },

  navigateDefaultTab: (channelId: string) => {
    const { tabs } = get();
    // If this channel is already open in a non-default tab, just activate it
    const existing = tabs.find((t) => t.channelId === channelId && !t.isDefault);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    if (tabs.length === 0) {
      const newTab: Tab = { id: newTabId(), channelId, unreadCount: 0, isDefault: true };
      set({ tabs: [newTab], activeTabId: newTab.id });
      return;
    }
    // Replace the default tab's channel (keep its id stable)
    const defaultTab = tabs[0];
    const updated: Tab = { ...defaultTab, channelId, unreadCount: 0, isDefault: true };
    set({
      tabs: [updated, ...tabs.slice(1)],
      activeTabId: updated.id,
    });
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return; // don't close last tab
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.isDefault) return; // don't close default tab

    const idx = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);

    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
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
