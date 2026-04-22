import { describe, it, expect, beforeEach } from "vitest";
import { useTabsStore } from "@/stores/tabsStore";

describe("tabsStore", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeTabId: null });
    // Reset internal counter via reopening store
  });

  describe("openTab", () => {
    it("creates new tab when channel not open", () => {
      useTabsStore.getState().openTab("ch1");

      const state = useTabsStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.tabs[0].channelId).toBe("ch1");
      expect(state.activeTabId).toBe(state.tabs[0].id);
    });

    it("activates existing tab instead of creating duplicate", () => {
      useTabsStore.getState().openTab("ch1");
      const firstId = useTabsStore.getState().tabs[0].id;

      useTabsStore.getState().openTab("ch1");

      const state = useTabsStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.activeTabId).toBe(firstId);
    });
  });

  describe("openNewTab", () => {
    it("always creates a new tab even if channel already open", () => {
      useTabsStore.getState().openTab("ch1");
      useTabsStore.getState().openNewTab("ch1");

      expect(useTabsStore.getState().tabs.length).toBe(2);
    });

    it("activates the newly created tab", () => {
      useTabsStore.getState().openTab("ch1");
      useTabsStore.getState().openNewTab("ch1");

      const state = useTabsStore.getState();
      const lastTab = state.tabs[state.tabs.length - 1];
      expect(state.activeTabId).toBe(lastTab.id);
    });
  });

  describe("navigateDefaultTab", () => {
    it("creates default tab when no tabs exist", () => {
      useTabsStore.getState().navigateDefaultTab("ch1");

      const state = useTabsStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.tabs[0].channelId).toBe("ch1");
      expect(state.tabs[0].isDefault).toBe(true);
    });

    it("updates default tab channel and activates it", () => {
      useTabsStore.getState().navigateDefaultTab("ch1");
      const defaultTabId = useTabsStore.getState().tabs[0].id;

      useTabsStore.getState().navigateDefaultTab("ch2");

      const state = useTabsStore.getState();
      expect(state.tabs[0].id).toBe(defaultTabId); // same id, stable
      expect(state.tabs[0].channelId).toBe("ch2");
      expect(state.activeTabId).toBe(defaultTabId);
    });

    it("activates non-default tab if channel already open there", () => {
      useTabsStore.getState().navigateDefaultTab("ch1"); // default tab
      useTabsStore.getState().openNewTab("ch2"); // non-default tab
      const ch2TabId = useTabsStore.getState().tabs[1].id;

      useTabsStore.getState().navigateDefaultTab("ch2");

      expect(useTabsStore.getState().activeTabId).toBe(ch2TabId);
    });
  });

  describe("closeTab", () => {
    it("does not close if only one tab", () => {
      useTabsStore.getState().openTab("ch1");
      const tabId = useTabsStore.getState().tabs[0].id;

      useTabsStore.getState().closeTab(tabId);

      expect(useTabsStore.getState().tabs.length).toBe(1);
    });

    it("does not close the default tab", () => {
      useTabsStore.getState().navigateDefaultTab("ch1");
      useTabsStore.getState().openNewTab("ch2");
      const defaultTabId = useTabsStore.getState().tabs[0].id;

      useTabsStore.getState().closeTab(defaultTabId);

      expect(useTabsStore.getState().tabs.some((t) => t.id === defaultTabId)).toBe(true);
    });

    it("closes non-default tab and activates adjacent", () => {
      useTabsStore.getState().navigateDefaultTab("ch1");
      useTabsStore.getState().openNewTab("ch2");
      const ch2Id = useTabsStore.getState().tabs[1].id;

      // Activate ch2 then close it
      useTabsStore.getState().setActiveTab(ch2Id);
      useTabsStore.getState().closeTab(ch2Id);

      const state = useTabsStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.tabs.some((t) => t.id === ch2Id)).toBe(false);
      // Active tab should fall back to remaining tab
      expect(state.activeTabId).toBe(state.tabs[0].id);
    });
  });

  describe("incrementTabUnread / clearTabUnread", () => {
    it("increments unread on inactive tab", () => {
      useTabsStore.getState().openTab("ch1");
      useTabsStore.getState().openNewTab("ch2");
      // Active is ch2; increment ch1
      useTabsStore.getState().incrementTabUnread("ch1");

      const ch1Tab = useTabsStore.getState().tabs.find((t) => t.channelId === "ch1")!;
      expect(ch1Tab.unreadCount).toBe(1);
    });

    it("does not increment unread on active tab", () => {
      useTabsStore.getState().openTab("ch1");
      // ch1 is active
      useTabsStore.getState().incrementTabUnread("ch1");

      const ch1Tab = useTabsStore.getState().tabs.find((t) => t.channelId === "ch1")!;
      expect(ch1Tab.unreadCount).toBe(0);
    });

    it("clears unread count on tab", () => {
      useTabsStore.getState().openTab("ch1");
      useTabsStore.getState().openNewTab("ch2");
      useTabsStore.getState().incrementTabUnread("ch1");

      const tabId = useTabsStore.getState().tabs.find((t) => t.channelId === "ch1")!.id;
      useTabsStore.getState().clearTabUnread(tabId);

      expect(useTabsStore.getState().tabs.find((t) => t.id === tabId)!.unreadCount).toBe(0);
    });
  });

  describe("hasTab", () => {
    it("returns true when channel is open in a tab", () => {
      useTabsStore.getState().openTab("ch1");
      expect(useTabsStore.getState().hasTab("ch1")).toBe(true);
    });

    it("returns false when channel is not open", () => {
      expect(useTabsStore.getState().hasTab("ch-not-open")).toBe(false);
    });
  });
});
