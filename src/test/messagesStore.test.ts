import { describe, it, expect, beforeEach } from "vitest";
import { useMessagesStore } from "@/stores/messagesStore";
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

describe("messagesStore", () => {
  beforeEach(() => {
    useMessagesStore.setState({
      orderByChannel: {},
      posts: {},
      loading: false,
      editingPostId: null,
      scrollToPostId: null,
    });
  });

  describe("setChannelPosts", () => {
    it("sets posts and order for a channel", () => {
      const post = makePost({ id: "p1" });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: post });

      const state = useMessagesStore.getState();
      expect(state.orderByChannel["ch1"]).toEqual(["p1"]);
      expect(state.posts["p1"]).toEqual(post);
    });

    it("preserves higher reply_count when merging posts", () => {
      const post = makePost({ id: "p1", reply_count: 5 });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: post });

      // Second call with lower reply_count should keep the higher value
      const updatedPost = makePost({ id: "p1", reply_count: 2 });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: updatedPost });

      expect(useMessagesStore.getState().posts["p1"].reply_count).toBe(5);
    });

    it("computes reply counts from loaded reply posts", () => {
      const root = makePost({ id: "root", reply_count: 0 });
      const reply1 = makePost({ id: "r1", root_id: "root", reply_count: 0 });
      const reply2 = makePost({ id: "r2", root_id: "root", reply_count: 0 });

      useMessagesStore.getState().setChannelPosts(
        "ch1",
        ["root", "r1", "r2"],
        { root, r1: reply1, r2: reply2 },
      );

      expect(useMessagesStore.getState().posts["root"].reply_count).toBe(2);
    });
  });

  describe("addPost", () => {
    it("adds post to the beginning of channel order", () => {
      const existing = makePost({ id: "p1", create_at: 1000 });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: existing });

      const newPost = makePost({ id: "p2", create_at: 2000 });
      useMessagesStore.getState().addPost(newPost);

      const order = useMessagesStore.getState().orderByChannel["ch1"];
      expect(order[0]).toBe("p2");
      expect(order).toContain("p1");
    });

    it("does not add duplicate post", () => {
      const post = makePost({ id: "p1" });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: post });
      useMessagesStore.getState().addPost(post);

      const order = useMessagesStore.getState().orderByChannel["ch1"];
      expect(order.filter((id) => id === "p1").length).toBe(1);
    });
  });

  describe("updatePost", () => {
    it("updates post data without changing order", () => {
      const post = makePost({ id: "p1", message: "original" });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: post });

      const edited = makePost({ id: "p1", message: "edited" });
      useMessagesStore.getState().updatePost(edited);

      expect(useMessagesStore.getState().posts["p1"].message).toBe("edited");
      expect(useMessagesStore.getState().orderByChannel["ch1"]).toEqual(["p1"]);
    });
  });

  describe("removePost", () => {
    it("removes post from both posts and order", () => {
      const p1 = makePost({ id: "p1" });
      const p2 = makePost({ id: "p2" });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1", "p2"], { p1, p2 });

      useMessagesStore.getState().removePost("p1");

      const state = useMessagesStore.getState();
      expect(state.posts["p1"]).toBeUndefined();
      expect(state.orderByChannel["ch1"]).toEqual(["p2"]);
    });

    it("is a no-op for nonexistent post", () => {
      useMessagesStore.getState().removePost("nonexistent");
      expect(useMessagesStore.getState().posts).toEqual({});
    });
  });

  describe("incrementReplyCount", () => {
    it("increments reply_count on root post", () => {
      const post = makePost({ id: "p1", reply_count: 3 });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: post });

      useMessagesStore.getState().incrementReplyCount("p1");

      expect(useMessagesStore.getState().posts["p1"].reply_count).toBe(4);
    });

    it("is a no-op for nonexistent post", () => {
      useMessagesStore.getState().incrementReplyCount("nonexistent");
      // Should not throw
      expect(useMessagesStore.getState().posts).toEqual({});
    });
  });

  describe("prependOlderPosts", () => {
    it("appends older posts to the end of existing order", () => {
      const newer = makePost({ id: "p1", create_at: 2000 });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: newer });

      const older = makePost({ id: "p0", create_at: 1000 });
      useMessagesStore.getState().prependOlderPosts("ch1", ["p0"], { p0: older });

      // Older posts go to the END (order is newest-first)
      const order = useMessagesStore.getState().orderByChannel["ch1"];
      expect(order).toEqual(["p1", "p0"]);
    });

    it("does not create duplicate entries", () => {
      const post = makePost({ id: "p1" });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: post });
      useMessagesStore.getState().prependOlderPosts("ch1", ["p1"], { p1: post });

      const order = useMessagesStore.getState().orderByChannel["ch1"];
      expect(order.filter((id) => id === "p1").length).toBe(1);
    });
  });

  describe("clearChannel", () => {
    it("removes channel from orderByChannel but keeps posts", () => {
      const post = makePost({ id: "p1" });
      useMessagesStore.getState().setChannelPosts("ch1", ["p1"], { p1: post });

      useMessagesStore.getState().clearChannel("ch1");

      const state = useMessagesStore.getState();
      expect(state.orderByChannel["ch1"]).toBeUndefined();
      expect(state.posts["p1"]).toBeDefined();
    });
  });

  describe("setEditingPostId / setScrollToPostId / setLoading", () => {
    it("sets editing post id", () => {
      useMessagesStore.getState().setEditingPostId("p1");
      expect(useMessagesStore.getState().editingPostId).toBe("p1");

      useMessagesStore.getState().setEditingPostId(null);
      expect(useMessagesStore.getState().editingPostId).toBeNull();
    });

    it("sets scroll to post id", () => {
      useMessagesStore.getState().setScrollToPostId("p1");
      expect(useMessagesStore.getState().scrollToPostId).toBe("p1");
    });

    it("sets loading", () => {
      useMessagesStore.getState().setLoading(true);
      expect(useMessagesStore.getState().loading).toBe(true);
    });
  });
});
