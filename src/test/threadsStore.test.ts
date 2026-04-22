import { describe, it, expect, beforeEach } from "vitest";
import { useThreadsStore } from "@/stores/threadsStore";
import type { UserThread } from "@/stores/threadsStore";
import type { PostData } from "@/stores/messagesStore";

function makePost(overrides: Partial<PostData> = {}): PostData {
  return {
    id: "post1",
    channel_id: "ch1",
    user_id: "user1",
    root_id: "",
    message: "hello",
    post_type: "",
    create_at: 1000,
    update_at: 1000,
    delete_at: 0,
    edit_at: 0,
    reply_count: 0,
    is_pinned: false,
    file_ids: [],
    props: {},
    ...overrides,
  };
}

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

const initialState = {
  activeThreadId: null,
  threadOrder: {},
  threadPosts: {},
  threadParticipants: {},
  userThreads: [],
  userThreadsTotal: 0,
  userThreadsUnread: 0,
  threadLoading: false,
  scrollToThreadPostId: null,
};

describe("threadsStore", () => {
  beforeEach(() => {
    useThreadsStore.setState(initialState);
  });

  describe("setThreadData", () => {
    it("stores thread order and posts", () => {
      const reply = makePost({ id: "r1", root_id: "root" });
      useThreadsStore.getState().setThreadData("root", ["r1"], { r1: reply });

      const state = useThreadsStore.getState();
      expect(state.threadOrder["root"]).toEqual(["r1"]);
      expect(state.threadPosts["r1"]).toEqual(reply);
    });
  });

  describe("addThreadReply", () => {
    it("appends reply to thread order", () => {
      const r1 = makePost({ id: "r1", root_id: "root" });
      useThreadsStore.getState().setThreadData("root", ["r1"], { r1 });

      const r2 = makePost({ id: "r2", root_id: "root" });
      useThreadsStore.getState().addThreadReply(r2);

      expect(useThreadsStore.getState().threadOrder["root"]).toEqual(["r1", "r2"]);
    });

    it("does not add duplicate reply", () => {
      const r1 = makePost({ id: "r1", root_id: "root" });
      useThreadsStore.getState().setThreadData("root", ["r1"], { r1 });
      useThreadsStore.getState().addThreadReply(r1);

      expect(useThreadsStore.getState().threadOrder["root"].filter((id) => id === "r1").length).toBe(1);
    });

    it("ignores posts without root_id", () => {
      const post = makePost({ id: "p1", root_id: "" });
      useThreadsStore.getState().addThreadReply(post);

      expect(useThreadsStore.getState().threadOrder).toEqual({});
    });
  });

  describe("removeThreadPost", () => {
    it("removes post from thread order and threadPosts", () => {
      const r1 = makePost({ id: "r1", root_id: "root" });
      const r2 = makePost({ id: "r2", root_id: "root" });
      useThreadsStore.getState().setThreadData("root", ["r1", "r2"], { r1, r2 });

      useThreadsStore.getState().removeThreadPost("r1", "root");

      const state = useThreadsStore.getState();
      expect(state.threadOrder["root"]).toEqual(["r2"]);
      expect(state.threadPosts["r1"]).toBeUndefined();
    });
  });

  describe("markThreadRead", () => {
    it("resets unread_replies and decrements userThreadsUnread", () => {
      const thread = makeThread({ id: "t1", unread_replies: 3 });
      useThreadsStore.setState({ userThreads: [thread], userThreadsUnread: 1 });

      useThreadsStore.getState().markThreadRead("t1");

      const state = useThreadsStore.getState();
      expect(state.userThreads[0].unread_replies).toBe(0);
      expect(state.userThreadsUnread).toBe(0);
    });

    it("does not decrement below zero", () => {
      const thread = makeThread({ id: "t1", unread_replies: 0 });
      useThreadsStore.setState({ userThreads: [thread], userThreadsUnread: 0 });

      useThreadsStore.getState().markThreadRead("t1");

      expect(useThreadsStore.getState().userThreadsUnread).toBe(0);
    });

    it("handles thread not in list but with orphaned count", () => {
      // Thread not in list, global counter is 1 (orphaned)
      useThreadsStore.setState({ userThreads: [], userThreadsUnread: 1 });

      useThreadsStore.getState().markThreadRead("unknown-thread");

      // Should decrement orphaned counter
      expect(useThreadsStore.getState().userThreadsUnread).toBe(0);
    });
  });

  describe("incrementThreadUnread", () => {
    it("increments unread_replies on existing thread and global counter (first time)", () => {
      const thread = makeThread({ id: "t1", unread_replies: 0 });
      useThreadsStore.setState({ userThreads: [thread], userThreadsUnread: 0 });

      useThreadsStore.getState().incrementThreadUnread("t1");

      const state = useThreadsStore.getState();
      expect(state.userThreads[0].unread_replies).toBe(1);
      expect(state.userThreadsUnread).toBe(1);
    });

    it("increments reply count but NOT global counter when already unread", () => {
      const thread = makeThread({ id: "t1", unread_replies: 2 });
      useThreadsStore.setState({ userThreads: [thread], userThreadsUnread: 1 });

      useThreadsStore.getState().incrementThreadUnread("t1");

      const state = useThreadsStore.getState();
      expect(state.userThreads[0].unread_replies).toBe(3);
      expect(state.userThreadsUnread).toBe(1); // unchanged
    });

    it("increments global counter when thread not in local list", () => {
      useThreadsStore.setState({ userThreads: [], userThreadsUnread: 0 });

      useThreadsStore.getState().incrementThreadUnread("unknown-thread");

      expect(useThreadsStore.getState().userThreadsUnread).toBe(1);
    });
  });

  describe("updateThreadFollowing", () => {
    it("updates is_following on existing thread", () => {
      const thread = makeThread({ id: "t1", is_following: true });
      useThreadsStore.setState({ userThreads: [thread] });

      useThreadsStore.getState().updateThreadFollowing("t1", false);

      expect(useThreadsStore.getState().userThreads[0].is_following).toBe(false);
    });

    it("creates stub entry when thread not in list", () => {
      useThreadsStore.setState({ userThreads: [] });

      useThreadsStore.getState().updateThreadFollowing("new-thread", true);

      const threads = useThreadsStore.getState().userThreads;
      expect(threads.length).toBe(1);
      expect(threads[0].id).toBe("new-thread");
      expect(threads[0].is_following).toBe(true);
    });
  });

  describe("setThreadParticipants", () => {
    it("stores participants for a thread", () => {
      useThreadsStore.getState().setThreadParticipants("root", ["u1", "u2", "u3"]);

      expect(useThreadsStore.getState().threadParticipants["root"]).toEqual(["u1", "u2", "u3"]);
    });
  });

  describe("clearThread", () => {
    it("sets activeThreadId to null", () => {
      useThreadsStore.setState({ activeThreadId: "t1" });
      useThreadsStore.getState().clearThread();

      expect(useThreadsStore.getState().activeThreadId).toBeNull();
    });
  });

  describe("setUserThreads", () => {
    it("stores threads with total and unread count", () => {
      const threads = [makeThread({ id: "t1" }), makeThread({ id: "t2" })];
      useThreadsStore.getState().setUserThreads(threads, 10, 3);

      const state = useThreadsStore.getState();
      expect(state.userThreads.length).toBe(2);
      expect(state.userThreadsTotal).toBe(10);
      expect(state.userThreadsUnread).toBe(3);
    });
  });
});
