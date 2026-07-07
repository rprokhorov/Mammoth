import { describe, it, expect, beforeEach } from "vitest";
import { useThreadsStore } from "@/stores/threadsStore";
import type { UserThread } from "@/stores/threadsStore";
import { useUiStore, type ChannelInfo } from "@/stores/uiStore";
import { useTabsStore } from "@/stores/tabsStore";
import {
  resolveChannelSelection,
  clearPendingChannelSelection,
  getPendingChannelSelection,
} from "@/stores/pendingChannelSelection";

function makeThread(overrides: Partial<UserThread> = {}): UserThread {
  return {
    id: "thread1",
    reply_count: 0,
    last_reply_at: 0,
    last_viewed_at: 0,
    participants: [],
    post: null,
    unread_replies: 0,
    unread_mentions: 0,
    is_following: true,
    ...overrides,
  };
}

function makeChannel(overrides: Partial<ChannelInfo> = {}): ChannelInfo {
  return {
    id: "ch1",
    team_id: "team1",
    display_name: "Channel 1",
    name: "channel-1",
    channel_type: "O",
    header: "",
    purpose: "",
    last_post_at: 0,
    total_msg_count: 0,
    msg_count: 0,
    mention_count: 0,
    last_viewed_at: 0,
    ...overrides,
  };
}

const threadsInitial = {
  activeThreadId: null,
  threadOrder: {},
  threadPosts: {},
  threadParticipants: {},
  userThreads: [] as UserThread[],
  userThreadsTotal: 0,
  userThreadsUnread: 0,
  threadLoading: false,
  scrollToThreadPostId: null,
};

describe("bugfixes", () => {
  // -------------------------------------------------------------------------
  // Bug 1: threadsStore.markThreadRead over-decrements userThreadsUnread when
  // a never-unread, not-in-list thread is marked read while the server's unread
  // total exceeds the count of unread threads currently loaded in the list.
  //
  // Repro: server reports 2 unread followed threads, but only ONE of them (t1)
  // is on the loaded page. Marking an UNRELATED thread (t3) read must NOT touch
  // the global counter — t3 was never unread. Before the fix, the "orphaned
  // count" heuristic (userThreadsUnread > knownUnreadCount) fired and decremented.
  // -------------------------------------------------------------------------
  describe("threadsStore.markThreadRead over-decrement (Bug 1)", () => {
    beforeEach(() => {
      useThreadsStore.setState(threadsInitial);
    });

    it("does not decrement global counter when marking a never-unread, not-in-list thread read", () => {
      // t1 is the only unread thread loaded; server says 2 unread total (t2 is
      // on a not-yet-loaded page). knownUnreadCount = 1, userThreadsUnread = 2.
      const t1 = makeThread({ id: "t1", unread_replies: 1 });
      useThreadsStore.setState({ userThreads: [t1], userThreadsUnread: 2 });

      // Mark a completely unrelated thread read — it was never unread.
      useThreadsStore.getState().markThreadRead("t3-unrelated");

      // The global unread counter must be untouched: t3 contributed nothing.
      expect(useThreadsStore.getState().userThreadsUnread).toBe(2);
    });

    it("still decrements when marking an in-list unread thread read", () => {
      const t1 = makeThread({ id: "t1", unread_replies: 1 });
      useThreadsStore.setState({ userThreads: [t1], userThreadsUnread: 2 });

      useThreadsStore.getState().markThreadRead("t1");

      const state = useThreadsStore.getState();
      expect(state.userThreads[0].unread_replies).toBe(0);
      expect(state.userThreadsUnread).toBe(1);
    });

    it("decrements a genuinely orphaned unknown thread exactly once (round-trip with incrementThreadUnread)", () => {
      // incrementThreadUnread for an unknown thread bumps the global counter but
      // does not add it to the list. markThreadRead for that SAME unknown thread
      // should bring the counter back down — but only once.
      useThreadsStore.setState({ userThreads: [], userThreadsUnread: 0 });

      useThreadsStore.getState().incrementThreadUnread("orphan");
      expect(useThreadsStore.getState().userThreadsUnread).toBe(1);

      useThreadsStore.getState().markThreadRead("orphan");
      expect(useThreadsStore.getState().userThreadsUnread).toBe(0);

      // A second markThreadRead for the same (now-cleared) orphan must not go negative
      useThreadsStore.getState().markThreadRead("orphan");
      expect(useThreadsStore.getState().userThreadsUnread).toBe(0);
    });

    it("never drives userThreadsUnread below zero", () => {
      const t1 = makeThread({ id: "t1", unread_replies: 1 });
      useThreadsStore.setState({ userThreads: [t1], userThreadsUnread: 0 });

      useThreadsStore.getState().markThreadRead("t1");

      expect(useThreadsStore.getState().userThreadsUnread).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Bug 2: App cold-start notification navigation selects a channel before the
  // channel list has loaded. resolveChannelSelection() is the extracted guard:
  // if the target channel isn't loaded yet, defer it as a pending selection so
  // it can be applied (with proper last_viewed priming) once channels arrive,
  // instead of setting a stale activeChannelId that suppresses auto-select.
  // -------------------------------------------------------------------------
  describe("cold-start channel selection guard (Bug 2)", () => {
    beforeEach(() => {
      clearPendingChannelSelection();
      useUiStore.setState({ channels: [], activeChannelId: null });
    });

    it("defers selection when the target channel is not loaded yet", () => {
      const result = resolveChannelSelection("ch-from-notif", []);
      expect(result).toBe("deferred");
      expect(getPendingChannelSelection()).toBe("ch-from-notif");
    });

    it("selects immediately when the target channel is already loaded", () => {
      const channels = [makeChannel({ id: "ch1" })];
      const result = resolveChannelSelection("ch1", channels);
      expect(result).toBe("ready");
      expect(getPendingChannelSelection()).toBeNull();
    });

    it("channels-loaded applies a pending selection instead of auto-selecting first public", () => {
      // Simulate the notification firing before channels load: it is deferred.
      resolveChannelSelection("ch-target", []);
      expect(getPendingChannelSelection()).toBe("ch-target");

      // Now channels arrive containing the target and other public channels.
      const loaded = [
        makeChannel({ id: "ch-first", channel_type: "O" }),
        makeChannel({ id: "ch-target", channel_type: "O" }),
      ];
      // After load, the pending selection resolves to "ready".
      const result = resolveChannelSelection("ch-target", loaded);
      expect(result).toBe("ready");
      expect(getPendingChannelSelection()).toBeNull();
    });

    it("clearPendingChannelSelection drops a stale pending target", () => {
      resolveChannelSelection("ch-x", []);
      expect(getPendingChannelSelection()).toBe("ch-x");
      clearPendingChannelSelection();
      expect(getPendingChannelSelection()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Characterization: tabsStore.incrementTabUnread and uiStore channel unread
  // math. These were audited and found CORRECT — the following tests lock in
  // the current (correct) behavior so future changes can't silently regress it.
  // -------------------------------------------------------------------------
  describe("tabsStore.incrementTabUnread (characterization — no bug)", () => {
    beforeEach(() => {
      useTabsStore.setState({ tabs: [], activeTabId: null });
    });

    it("does not increment the active tab", () => {
      useTabsStore.getState().openTab("ch1"); // ch1 becomes active
      useTabsStore.getState().incrementTabUnread("ch1");
      const tab = useTabsStore.getState().tabs.find((t) => t.channelId === "ch1")!;
      expect(tab.unreadCount).toBe(0);
    });

    it("increments only the matching inactive tab, not siblings", () => {
      useTabsStore.getState().openTab("ch1");
      useTabsStore.getState().openNewTab("ch2"); // ch2 active
      useTabsStore.getState().openNewTab("ch3"); // ch3 active
      // Increment ch1 (inactive) twice
      useTabsStore.getState().incrementTabUnread("ch1");
      useTabsStore.getState().incrementTabUnread("ch1");

      const tabs = useTabsStore.getState().tabs;
      expect(tabs.find((t) => t.channelId === "ch1")!.unreadCount).toBe(2);
      expect(tabs.find((t) => t.channelId === "ch2")!.unreadCount).toBe(0);
      expect(tabs.find((t) => t.channelId === "ch3")!.unreadCount).toBe(0);
    });

    it("is a no-op for a channel with no open tab", () => {
      useTabsStore.getState().openTab("ch1");
      useTabsStore.getState().incrementTabUnread("ch-none");
      expect(useTabsStore.getState().tabs.length).toBe(1);
      expect(useTabsStore.getState().tabs[0].unreadCount).toBe(0);
    });
  });

  describe("uiStore channel unread math (characterization — no bug)", () => {
    beforeEach(() => {
      useUiStore.setState({ channels: [] });
    });

    it("incrementChannelUnread bumps total_msg_count, and mention_count only when mentioned", () => {
      const ch = makeChannel({ id: "ch1", total_msg_count: 5, mention_count: 0 });
      useUiStore.setState({ channels: [ch] });

      useUiStore.getState().incrementChannelUnread("ch1", false);
      let updated = useUiStore.getState().channels[0];
      expect(updated.total_msg_count).toBe(6);
      expect(updated.mention_count).toBe(0);

      useUiStore.getState().incrementChannelUnread("ch1", true);
      updated = useUiStore.getState().channels[0];
      expect(updated.total_msg_count).toBe(7);
      expect(updated.mention_count).toBe(1);
    });

    it("clearChannelUnread zeroes mentions and syncs msg_count to total_msg_count", () => {
      const ch = makeChannel({ id: "ch1", total_msg_count: 10, msg_count: 3, mention_count: 4 });
      useUiStore.setState({ channels: [ch] });

      useUiStore.getState().clearChannelUnread("ch1");

      const updated = useUiStore.getState().channels[0];
      expect(updated.mention_count).toBe(0);
      expect(updated.msg_count).toBe(10);
      expect(updated.last_viewed_at).toBeGreaterThan(0);
    });

    it("clearChannelUnread only touches the target channel", () => {
      const ch1 = makeChannel({ id: "ch1", total_msg_count: 10, msg_count: 3, mention_count: 4 });
      const ch2 = makeChannel({ id: "ch2", total_msg_count: 8, msg_count: 2, mention_count: 2 });
      useUiStore.setState({ channels: [ch1, ch2] });

      useUiStore.getState().clearChannelUnread("ch1");

      const other = useUiStore.getState().channels.find((c) => c.id === "ch2")!;
      expect(other.mention_count).toBe(2);
      expect(other.msg_count).toBe(2);
    });
  });
});
