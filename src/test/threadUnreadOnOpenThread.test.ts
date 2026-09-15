import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { handlePosted, seenMsgCount } from "@/hooks/useWebSocket";
import { useThreadsStore, type UserThread } from "@/stores/threadsStore";
import { useUiStore } from "@/stores/uiStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";

const invokeMock = vi.mocked(invoke);

function makeThread(overrides: Partial<UserThread> = {}): UserThread {
  return {
    id: "root1",
    reply_count: 1,
    last_reply_at: 1000,
    last_viewed_at: 0,
    participants: [],
    post: null,
    unread_replies: 0,
    unread_mentions: 0,
    is_following: true,
    ...overrides,
  };
}

function makeReply(overrides: Partial<PostData> = {}): PostData {
  return {
    id: "reply1",
    channel_id: "dm1",
    user_id: "other",
    root_id: "root1",
    message: "a reply",
    post_type: "",
    create_at: 2000,
    update_at: 2000,
    delete_at: 0,
    edit_at: 0,
    reply_count: 0,
    is_pinned: false,
    file_ids: [],
    props: {},
    ...overrides,
  };
}

function postedPayload(post: PostData) {
  return { post: JSON.stringify(post) };
}

describe("thread replies while the thread panel is open", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    useThreadsStore.setState({
      activeThreadId: null,
      threadOrder: {},
      threadPosts: {},
      threadParticipants: {},
      userThreads: [],
      userThreadsTotal: 0,
      userThreadsUnread: 0,
      threadLoading: false,
      scrollToThreadPostId: null,
    });
    useMessagesStore.setState({ posts: {}, orderByChannel: {} });
    useUiStore.setState({
      channels: [],
      activeChannelId: "dm1",
      activeTeamId: "team1",
      activeServerId: "srv1",
      currentUserId: "me",
      users: {},
    });
  });

  it("does not leave the thread unread when the reply lands in the open thread", () => {
    useThreadsStore.setState({
      activeThreadId: "root1",
      userThreads: [makeThread()],
      userThreadsUnread: 0,
    });

    handlePosted(postedPayload(makeReply()), { channel_id: "dm1" }, "srv1");

    const state = useThreadsStore.getState();
    expect(state.threadOrder["root1"]).toEqual(["reply1"]);
    expect(state.userThreads[0].unread_replies).toBe(0);
    expect(state.userThreadsUnread).toBe(0);
  });

  it("tells the server the open thread was read, so the channel stops resyncing as unread", () => {
    useThreadsStore.setState({
      activeThreadId: "root1",
      userThreads: [makeThread()],
    });

    handlePosted(postedPayload(makeReply()), { channel_id: "dm1" }, "srv1");

    const markCalls = invokeMock.mock.calls.filter((c) => c[0] === "mark_thread_as_read");
    expect(markCalls).toHaveLength(1);
    expect(markCalls[0][1]).toMatchObject({
      serverId: "srv1",
      teamId: "team1",
      threadId: "root1",
    });
  });

  it("clears an unread count carried over from before the panel was opened", () => {
    useThreadsStore.setState({
      activeThreadId: "root1",
      userThreads: [makeThread({ unread_replies: 2 })],
      userThreadsUnread: 1,
    });

    handlePosted(postedPayload(makeReply()), { channel_id: "dm1" }, "srv1");

    const state = useThreadsStore.getState();
    expect(state.userThreads[0].unread_replies).toBe(0);
    expect(state.userThreadsUnread).toBe(0);
  });

  it("still marks a non-open followed thread as unread", () => {
    useThreadsStore.setState({
      activeThreadId: null,
      userThreads: [makeThread()],
      userThreadsUnread: 0,
    });

    handlePosted(postedPayload(makeReply()), { channel_id: "dm1" }, "srv1");

    const state = useThreadsStore.getState();
    expect(state.userThreads[0].unread_replies).toBe(1);
    expect(state.userThreadsUnread).toBe(1);
    expect(invokeMock.mock.calls.filter((c) => c[0] === "mark_thread_as_read")).toHaveLength(0);
  });

  it("never raises the channel unread badge for a thread reply", () => {
    useUiStore.setState({
      activeChannelId: "other-channel",
      channels: [
        {
          id: "dm1",
          team_id: "team1",
          display_name: "DM",
          name: "me__other",
          channel_type: "D",
          header: "",
          purpose: "",
          last_post_at: 1000,
          total_msg_count: 5,
          msg_count: 5,
          mention_count: 0,
          last_viewed_at: 1000,
        },
      ],
    });
    useThreadsStore.setState({ activeThreadId: "root1", userThreads: [makeThread()] });

    handlePosted(postedPayload(makeReply()), { channel_id: "dm1" }, "srv1");

    const ch = useUiStore.getState().channels[0];
    expect(ch.total_msg_count).toBe(ch.msg_count);
    expect(ch.mention_count).toBe(0);
  });
});

describe("seenMsgCount", () => {
  it("uses the root count, matching the scale of total_msg_count", () => {
    // 10 root posts seen, 17 posts seen counting thread replies.
    expect(seenMsgCount({ msg_count: 17, msg_count_root: 10, mention_count: 0 })).toBe(10);
  });

  it("falls back to the plain count on servers without root counts", () => {
    expect(seenMsgCount({ msg_count: 17, msg_count_root: 0, mention_count: 0 })).toBe(17);
  });
});
