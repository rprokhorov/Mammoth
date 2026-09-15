import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useUiStore, type ChannelInfo, type UserInfo } from "@/stores/uiStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useReactionsStore } from "@/stores/reactionsStore";
import { useDraftsStore } from "@/stores/draftsStore";

// Grant notification permission at module load so the IIFE in useWebSocket
// sets notifPermission = true and the desktop-notification path is reachable.
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(() => Promise.resolve("granted")),
  sendNotification: vi.fn(),
}));

// draftsStore uses zustand's persist middleware; install a working localStorage
// BEFORE any module import evaluates (vi.hoisted runs first) so the persist
// storage factory resolves to it and setState() in beforeEach doesn't throw.
vi.hoisted(() => {
  const backing = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
    setItem: (k: string, v: string) => void backing.set(k, String(v)),
    removeItem: (k: string) => void backing.delete(k),
    clear: () => backing.clear(),
    key: (i: number) => Array.from(backing.keys())[i] ?? null,
    get length() {
      return backing.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: shim,
  });
});

// -------------------------------------------------------------------------
// Test harness: render useWebSocket, capture the ws_event listener callback,
// and drive it directly with Mattermost-shaped payloads.
// -------------------------------------------------------------------------

type WsBroadcast = { channel_id: string; team_id: string; user_id: string };
type WsEventPayload = {
  server_id: string;
  event: string;
  data: Record<string, unknown>;
  broadcast: WsBroadcast;
};

const SERVER_ID = "srv1";
const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);
const emitMock = vi.mocked(emit);

let wsEventCb: ((event: { payload: WsEventPayload }) => void) | null = null;

function mountHook() {
  // Capture the callback registered for "ws_event"
  listenMock.mockImplementation((eventName: string, cb: unknown) => {
    if (eventName === "ws_event") {
      wsEventCb = cb as (event: { payload: WsEventPayload }) => void;
    }
    return Promise.resolve(() => {});
  });
  return renderHook(() => useWebSocket());
}

function fireWsEvent(
  event: string,
  data: Record<string, unknown>,
  broadcast: Partial<WsBroadcast> = {},
) {
  if (!wsEventCb) throw new Error("ws_event listener not registered");
  wsEventCb({
    payload: {
      server_id: SERVER_ID,
      event,
      data,
      broadcast: {
        channel_id: broadcast.channel_id ?? "",
        team_id: broadcast.team_id ?? "team1",
        user_id: broadcast.user_id ?? "u-other",
      },
    },
  });
}

function makePost(overrides: Partial<PostData> = {}): PostData {
  return {
    id: "p1",
    channel_id: "ch1",
    user_id: "u-other",
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

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: "u-me",
    username: "me",
    first_name: "My",
    last_name: "Self",
    nickname: "",
    email: "me@example.com",
    ...overrides,
  };
}

const uiInitial = {
  activeServerId: SERVER_ID,
  channels: [] as ChannelInfo[],
  activeChannelId: null as string | null,
  currentUserId: null as string | null,
  users: {} as Record<string, UserInfo>,
  channelNotifyProps: {} as Record<string, Record<string, string>>,
  typingUsers: {} as Record<string, string[]>,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Real invoke() always returns a Promise; the hook chains `.catch()` on it.
  invokeMock.mockResolvedValue(undefined);
  wsEventCb = null;
  useUiStore.setState(uiInitial);
  useMessagesStore.setState({ orderByChannel: {}, posts: {} });
  useThreadsStore.setState({
    activeThreadId: null,
    threadOrder: {},
    threadPosts: {},
    userThreads: [],
    userThreadsTotal: 0,
    userThreadsUnread: 0,
    orphanedUnreadThreadIds: [],
  });
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useReactionsStore.setState({ notifications: [], unreadCount: 0 });
  useDraftsStore.setState({ drafts: {}, serverId: null });
});

describe("useWebSocket ws_event routing", () => {
  it("ignores events from a non-active server", () => {
    mountHook();
    useUiStore.setState({ channels: [makeChannel({ id: "ch1" })], activeChannelId: null });
    // server_id mismatch — handler must early-return
    wsEventCb!({
      payload: {
        server_id: "other-server",
        event: "posted",
        data: { post: JSON.stringify(makePost({ id: "px" })) },
        broadcast: { channel_id: "ch1", team_id: "team1", user_id: "u-other" },
      },
    });
    expect(useMessagesStore.getState().posts["px"]).toBeUndefined();
  });
});

describe("handlePosted — top-level posts", () => {
  beforeEach(() => mountHook());

  it("adds a top-level post to the channel order", () => {
    const post = makePost({ id: "p1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(post) }, { channel_id: "ch1" });

    expect(useMessagesStore.getState().posts["p1"]).toMatchObject({ id: "p1" });
    expect(useMessagesStore.getState().orderByChannel["ch1"]).toEqual(["p1"]);
  });

  it("bumps unread badge for a non-active channel", () => {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1", total_msg_count: 5 })],
      activeChannelId: "ch2",
    });
    const post = makePost({ id: "p1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(post) }, { channel_id: "ch1" });

    const ch = useUiStore.getState().channels[0];
    expect(ch.total_msg_count).toBe(6);
    expect(ch.mention_count).toBe(0);
  });

  it("does not bump unread when the post lands in the active channel", () => {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1", total_msg_count: 5 })],
      activeChannelId: "ch1",
    });
    const post = makePost({ id: "p1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(post) }, { channel_id: "ch1" });

    expect(useUiStore.getState().channels[0].total_msg_count).toBe(5);
  });

  it("bumps mention_count when the message mentions the current user", () => {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1" })],
      activeChannelId: "ch2",
      currentUserId: "u-me",
      users: { "u-me": makeUser({ id: "u-me", username: "me" }) },
    });
    const post = makePost({ id: "p1", channel_id: "ch1", message: "hey @me look" });
    fireWsEvent("posted", { post: JSON.stringify(post) }, { channel_id: "ch1" });

    expect(useUiStore.getState().channels[0].mention_count).toBe(1);
  });

  it("increments the tab unread badge for a non-active tab", () => {
    useTabsStore.getState().openTab("ch1"); // ch1 active
    useTabsStore.getState().openNewTab("ch2"); // ch2 active now
    useUiStore.setState({ channels: [makeChannel({ id: "ch1" })], activeChannelId: "ch2" });

    const post = makePost({ id: "p1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(post) }, { channel_id: "ch1" });

    const tab = useTabsStore.getState().tabs.find((t) => t.channelId === "ch1")!;
    expect(tab.unreadCount).toBe(1);
  });

  it("ignores a posted event with no broadcast channel_id", () => {
    const post = makePost({ id: "p1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(post) }, { channel_id: "" });
    expect(useMessagesStore.getState().posts["p1"]).toBeUndefined();
  });

  it("ignores malformed post JSON without throwing", () => {
    expect(() =>
      fireWsEvent("posted", { post: "{not json" }, { channel_id: "ch1" }),
    ).not.toThrow();
    expect(Object.keys(useMessagesStore.getState().posts)).toHaveLength(0);
  });
});

describe("handlePosted — thread replies", () => {
  beforeEach(() => mountHook());

  it("does not add a thread reply to the channel order, but stores it", () => {
    // Seed root post so incrementReplyCount has something to bump
    useMessagesStore.setState({ posts: { root1: makePost({ id: "root1", reply_count: 0 }) } });
    const reply = makePost({ id: "r1", root_id: "root1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(reply) }, { channel_id: "ch1" });

    expect(useMessagesStore.getState().posts["r1"]).toMatchObject({ id: "r1" });
    expect(useMessagesStore.getState().orderByChannel["ch1"]).toBeUndefined();
  });

  it("increments reply_count on the root post", () => {
    useMessagesStore.setState({ posts: { root1: makePost({ id: "root1", reply_count: 2 }) } });
    const reply = makePost({ id: "r1", root_id: "root1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(reply) }, { channel_id: "ch1" });

    expect(useMessagesStore.getState().posts["root1"].reply_count).toBe(3);
  });

  it("routes the reply into the open thread panel when the thread is active", () => {
    useMessagesStore.setState({ posts: { root1: makePost({ id: "root1" }) } });
    useThreadsStore.setState({ activeThreadId: "root1" });
    const reply = makePost({ id: "r1", root_id: "root1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(reply) }, { channel_id: "ch1" });

    expect(useThreadsStore.getState().threadOrder["root1"]).toEqual(["r1"]);
  });

  it("increments unread only for a followed thread when the panel is closed", () => {
    useMessagesStore.setState({ posts: { root1: makePost({ id: "root1" }) } });
    useThreadsStore.setState({
      activeThreadId: null,
      userThreads: [
        {
          id: "root1",
          reply_count: 0,
          last_reply_at: 0,
          last_viewed_at: 0,
          participants: [],
          post: null,
          unread_replies: 0,
          unread_mentions: 0,
          is_following: true,
        },
      ],
      userThreadsUnread: 0,
    });
    const reply = makePost({ id: "r1", root_id: "root1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(reply) }, { channel_id: "ch1" });

    expect(useThreadsStore.getState().userThreadsUnread).toBe(1);
    expect(useThreadsStore.getState().userThreads[0].unread_replies).toBe(1);
  });

  it("does not increment thread unread for an unfollowed thread", () => {
    useMessagesStore.setState({ posts: { root1: makePost({ id: "root1" }) } });
    useThreadsStore.setState({ activeThreadId: null, userThreads: [], userThreadsUnread: 0 });
    const reply = makePost({ id: "r1", root_id: "root1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(reply) }, { channel_id: "ch1" });

    expect(useThreadsStore.getState().userThreadsUnread).toBe(0);
  });

  it("does not bump channel unread badge for a thread reply", () => {
    useMessagesStore.setState({ posts: { root1: makePost({ id: "root1" }) } });
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1", total_msg_count: 5 })],
      activeChannelId: "ch2",
    });
    const reply = makePost({ id: "r1", root_id: "root1", channel_id: "ch1" });
    fireWsEvent("posted", { post: JSON.stringify(reply) }, { channel_id: "ch1" });

    expect(useUiStore.getState().channels[0].total_msg_count).toBe(5);
  });
});

describe("handlePosted — system messages", () => {
  beforeEach(() => mountHook());

  it("does not bump channel unread for a system message", () => {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1", total_msg_count: 5 })],
      activeChannelId: "ch2",
    });
    const sysPost = makePost({ id: "sys1", channel_id: "ch1", post_type: "system_join_channel" });
    fireWsEvent("posted", { post: JSON.stringify(sysPost) }, { channel_id: "ch1" });

    // System message still added to feed, but no unread bump
    expect(useUiStore.getState().channels[0].total_msg_count).toBe(5);
  });

  it("does not increment the tab unread badge for a system message", () => {
    useTabsStore.getState().openTab("ch1");
    useTabsStore.getState().openNewTab("ch2");
    useUiStore.setState({ channels: [makeChannel({ id: "ch1" })], activeChannelId: "ch2" });

    const sysPost = makePost({ id: "sys1", channel_id: "ch1", post_type: "system_add_to_channel" });
    fireWsEvent("posted", { post: JSON.stringify(sysPost) }, { channel_id: "ch1" });

    const tab = useTabsStore.getState().tabs.find((t) => t.channelId === "ch1")!;
    expect(tab.unreadCount).toBe(0);
  });

  it("never sends a desktop notification for a system message", () => {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1" })],
      activeChannelId: "ch2",
      currentUserId: "u-me",
      users: { "u-me": makeUser() },
    });
    const sysPost = makePost({ id: "sys1", channel_id: "ch1", post_type: "system_join_channel", user_id: "u-other" });
    fireWsEvent("posted", { post: JSON.stringify(sysPost) }, { channel_id: "ch1" });

    expect(invokeMock).not.toHaveBeenCalledWith("show_notification", expect.anything());
  });
});

describe("shouldNotify / isMentioned matrix (via desktop notification)", () => {
  beforeEach(() => mountHook());

  function setup(channelOverrides: Partial<ChannelInfo>, notifyProps?: Record<string, string>) {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1", ...channelOverrides })],
      activeChannelId: "ch2",
      currentUserId: "u-me",
      users: { "u-me": makeUser({ id: "u-me", username: "me" }) },
      channelNotifyProps: notifyProps ? { ch1: notifyProps } : {},
    });
  }

  function firePost(message: string) {
    const post = makePost({ id: "p1", channel_id: "ch1", user_id: "u-other", message });
    fireWsEvent("posted", { post: JSON.stringify(post) }, { channel_id: "ch1" });
  }

  function notified(): boolean {
    return invokeMock.mock.calls.some((c) => c[0] === "show_notification");
  }

  it("notifies on a plain message with default prefs", () => {
    setup({});
    firePost("just a normal message");
    expect(notified()).toBe(true);
  });

  it("does NOT notify in a muted channel (mark_unread none)", () => {
    setup({ mark_unread: "none" });
    firePost("hey @me");
    expect(notified()).toBe(false);
  });

  it("does NOT notify when desktop pref is none", () => {
    setup({}, { desktop: "none" });
    firePost("hey @me");
    expect(notified()).toBe(false);
  });

  it("notifies on every message when desktop pref is all", () => {
    setup({}, { desktop: "all" });
    firePost("plain message, no mention");
    expect(notified()).toBe(true);
  });

  it("desktop=mention: notifies on @username but not on a plain message", () => {
    setup({}, { desktop: "mention" });
    firePost("plain message");
    expect(notified()).toBe(false);

    invokeMock.mockClear();
    firePost("ping @me");
    expect(notified()).toBe(true);
  });

  it("desktop=mention: notifies on @channel", () => {
    setup({}, { desktop: "mention" });
    firePost("attention @channel please");
    expect(notified()).toBe(true);
  });

  it("desktop=mention: notifies on @all and @here", () => {
    setup({}, { desktop: "mention" });
    firePost("@all standup");
    expect(notified()).toBe(true);

    invokeMock.mockClear();
    firePost("who is @here");
    expect(notified()).toBe(true);
  });

  it("mark_unread=mention behaves like desktop=mention (plain message suppressed)", () => {
    setup({ mark_unread: "mention" });
    firePost("plain message");
    expect(notified()).toBe(false);

    invokeMock.mockClear();
    firePost("@channel heads up");
    expect(notified()).toBe(true);
  });

  it("desktop=mention with no current user does not notify", () => {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1" })],
      activeChannelId: "ch2",
      currentUserId: null,
      users: {},
      channelNotifyProps: { ch1: { desktop: "mention" } },
    });
    const post = makePost({ id: "p1", channel_id: "ch1", message: "@channel hi" });
    fireWsEvent("posted", { post: JSON.stringify(post) }, { channel_id: "ch1" });
    expect(notified()).toBe(false);
  });

  it("only a @channel-style broadcast counts as a mention for unread badge when there is no username", () => {
    // currentUserId set but user has empty username -> @username match must not fire
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1" })],
      activeChannelId: "ch2",
      currentUserId: "u-me",
      users: { "u-me": makeUser({ id: "u-me", username: "" }) },
    });
    const post = makePost({ id: "p1", channel_id: "ch1", message: "hello @me" });
    fireWsEvent("posted", { post: JSON.stringify(post) }, { channel_id: "ch1" });
    // No username => "@me" is not a mention of us; mention_count stays 0
    expect(useUiStore.getState().channels[0].mention_count).toBe(0);
  });
});

describe("handleReactionAdded / handleReactionRemoved", () => {
  beforeEach(() => mountHook());

  function reactionPayload(over: Partial<{ user_id: string; post_id: string; emoji_name: string; create_at: number }> = {}) {
    return {
      reaction: JSON.stringify({
        user_id: over.user_id ?? "u-other",
        post_id: over.post_id ?? "p1",
        emoji_name: over.emoji_name ?? "thumbsup",
        create_at: over.create_at ?? 5000,
      }),
    };
  }

  it("adds a reaction chip to the post", () => {
    useMessagesStore.setState({ posts: { p1: makePost({ id: "p1" }) } });
    fireWsEvent("reaction_added", reactionPayload(), { channel_id: "ch1" });

    const reactions = useMessagesStore.getState().posts["p1"].metadata?.reactions ?? [];
    expect(reactions).toHaveLength(1);
    expect(reactions[0]).toMatchObject({ user_id: "u-other", emoji_name: "thumbsup" });
  });

  it("dedups an identical reaction (same user + emoji)", () => {
    useMessagesStore.setState({ posts: { p1: makePost({ id: "p1" }) } });
    fireWsEvent("reaction_added", reactionPayload(), { channel_id: "ch1" });
    fireWsEvent("reaction_added", reactionPayload(), { channel_id: "ch1" });

    expect(useMessagesStore.getState().posts["p1"].metadata?.reactions).toHaveLength(1);
  });

  it("mirrors the reaction onto the thread copy of the post", () => {
    useMessagesStore.setState({ posts: { p1: makePost({ id: "p1", root_id: "root1" }) } });
    fireWsEvent("reaction_added", reactionPayload(), { channel_id: "ch1" });

    const threadCopy = useThreadsStore.getState().threadPosts["p1"];
    expect(threadCopy?.metadata?.reactions).toHaveLength(1);
  });

  it("notifies (adds a reaction notification) when someone reacts to MY post", () => {
    useUiStore.setState({ currentUserId: "u-me" });
    useMessagesStore.setState({ posts: { p1: makePost({ id: "p1", user_id: "u-me", message: "my post" }) } });
    fireWsEvent("reaction_added", reactionPayload({ user_id: "u-other" }), { channel_id: "ch1" });

    const notifs = useReactionsStore.getState().notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ postId: "p1", reactorUserId: "u-other", emojiName: "thumbsup" });
    expect(useReactionsStore.getState().unreadCount).toBe(1);
  });

  it("does NOT notify when I react to my own post", () => {
    useUiStore.setState({ currentUserId: "u-me" });
    useMessagesStore.setState({ posts: { p1: makePost({ id: "p1", user_id: "u-me" }) } });
    fireWsEvent("reaction_added", reactionPayload({ user_id: "u-me" }), { channel_id: "ch1" });

    expect(useReactionsStore.getState().notifications).toHaveLength(0);
  });

  it("does NOT notify when someone reacts to a post that is not mine", () => {
    useUiStore.setState({ currentUserId: "u-me" });
    useMessagesStore.setState({ posts: { p1: makePost({ id: "p1", user_id: "u-other" }) } });
    fireWsEvent("reaction_added", reactionPayload({ user_id: "u-third" }), { channel_id: "ch1" });

    expect(useReactionsStore.getState().notifications).toHaveLength(0);
  });

  it("removes a reaction chip on reaction_removed", () => {
    useMessagesStore.setState({
      posts: {
        p1: makePost({
          id: "p1",
          metadata: { reactions: [{ user_id: "u-other", post_id: "p1", emoji_name: "thumbsup", create_at: 5000 }] },
        }),
      },
    });
    fireWsEvent("reaction_removed", reactionPayload(), { channel_id: "ch1" });

    expect(useMessagesStore.getState().posts["p1"].metadata?.reactions).toHaveLength(0);
  });

  it("reaction on an unknown post is a no-op (does not throw)", () => {
    expect(() =>
      fireWsEvent("reaction_added", reactionPayload({ post_id: "missing" }), { channel_id: "ch1" }),
    ).not.toThrow();
    expect(useReactionsStore.getState().notifications).toHaveLength(0);
  });
});

describe("handleChannelViewed / handleMultipleChannelsViewed", () => {
  beforeEach(() => mountHook());

  it("clears unread for a non-active channel from data.channel_id", () => {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1", total_msg_count: 10, msg_count: 3, mention_count: 4 })],
      activeChannelId: "ch2",
    });
    invokeMock.mockResolvedValue({ msg_count: 10, mention_count: 0 });
    fireWsEvent("channel_viewed", { channel_id: "ch1" });

    const ch = useUiStore.getState().channels[0];
    expect(ch.mention_count).toBe(0);
    expect(ch.msg_count).toBe(10);
  });

  it("skips clearing for the active channel", () => {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1", total_msg_count: 10, msg_count: 3, mention_count: 4 })],
      activeChannelId: "ch1",
    });
    fireWsEvent("channel_viewed", { channel_id: "ch1" });

    expect(useUiStore.getState().channels[0].mention_count).toBe(4);
  });

  it("falls back to broadcast.channel_id when data has none", () => {
    useUiStore.setState({
      channels: [makeChannel({ id: "ch1", mention_count: 2 })],
      activeChannelId: "ch2",
    });
    invokeMock.mockResolvedValue({ msg_count: 0, mention_count: 0 });
    fireWsEvent("channel_viewed", {}, { channel_id: "ch1" });

    expect(useUiStore.getState().channels[0].mention_count).toBe(0);
  });

  it("multiple_channels_viewed clears every non-active channel", () => {
    useUiStore.setState({
      channels: [
        makeChannel({ id: "ch1", total_msg_count: 10, mention_count: 4 }),
        makeChannel({ id: "ch2", total_msg_count: 8, mention_count: 3 }),
        makeChannel({ id: "ch3", total_msg_count: 6, mention_count: 2 }),
      ],
      activeChannelId: "ch3",
    });
    invokeMock.mockResolvedValue({ msg_count: 0, mention_count: 0 });
    fireWsEvent("multiple_channels_viewed", {
      channel_times: { ch1: 111, ch2: 222, ch3: 333 },
    });

    const s = useUiStore.getState();
    expect(s.channels.find((c) => c.id === "ch1")!.mention_count).toBe(0);
    expect(s.channels.find((c) => c.id === "ch2")!.mention_count).toBe(0);
    // active channel untouched by the optimistic clear
    expect(s.channels.find((c) => c.id === "ch3")!.mention_count).toBe(2);
  });
});

describe("handleTyping (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mountHook();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("adds a typing user and removes them after 5 seconds", () => {
    fireWsEvent("typing", {}, { channel_id: "ch1", user_id: "u-other" });
    expect(useUiStore.getState().typingUsers["ch1"]).toEqual(["u-other"]);

    vi.advanceTimersByTime(5000);
    expect(useUiStore.getState().typingUsers["ch1"]).toEqual([]);
  });

  it("resets the 5s timer on a repeat typing event", () => {
    fireWsEvent("typing", {}, { channel_id: "ch1", user_id: "u-other" });
    vi.advanceTimersByTime(4000);
    // second event before timeout — should extend the window
    fireWsEvent("typing", {}, { channel_id: "ch1", user_id: "u-other" });
    vi.advanceTimersByTime(4000);
    expect(useUiStore.getState().typingUsers["ch1"]).toEqual(["u-other"]);

    vi.advanceTimersByTime(1000);
    expect(useUiStore.getState().typingUsers["ch1"]).toEqual([]);
  });

  it("ignores a typing event with no channel or user", () => {
    fireWsEvent("typing", {}, { channel_id: "", user_id: "" });
    expect(useUiStore.getState().typingUsers["ch1"]).toBeUndefined();
  });
});

describe("handleDraftUpserted / handleDraftDeleted (newer-wins)", () => {
  beforeEach(() => mountHook());

  it("applies a remote draft when there is no local draft", () => {
    fireWsEvent("draft_updated", {
      draft: JSON.stringify({ channel_id: "ch1", message: "remote text", update_at: 100 }),
    });
    expect(useDraftsStore.getState().drafts["channel:ch1"]).toMatchObject({ message: "remote text" });
  });

  it("applies a remote draft that is newer than the local one", () => {
    useDraftsStore.setState({
      drafts: { "channel:ch1": { message: "old local", channelId: "ch1", rootId: "", updateAt: 50 } },
    });
    fireWsEvent("draft_updated", {
      draft: JSON.stringify({ channel_id: "ch1", message: "newer remote", update_at: 100 }),
    });
    expect(useDraftsStore.getState().drafts["channel:ch1"].message).toBe("newer remote");
  });

  it("does NOT overwrite a newer local draft with an older remote one", () => {
    useDraftsStore.setState({
      drafts: { "channel:ch1": { message: "newer local", channelId: "ch1", rootId: "", updateAt: 200 } },
    });
    fireWsEvent("draft_updated", {
      draft: JSON.stringify({ channel_id: "ch1", message: "stale remote", update_at: 100 }),
    });
    expect(useDraftsStore.getState().drafts["channel:ch1"].message).toBe("newer local");
  });

  it("removes the local draft when a newer remote draft is empty", () => {
    useDraftsStore.setState({
      drafts: { "channel:ch1": { message: "local", channelId: "ch1", rootId: "", updateAt: 50 } },
    });
    fireWsEvent("draft_updated", {
      draft: JSON.stringify({ channel_id: "ch1", message: "   ", update_at: 100 }),
    });
    expect(useDraftsStore.getState().drafts["channel:ch1"]).toBeUndefined();
  });

  it("keys thread drafts by root_id", () => {
    fireWsEvent("draft_updated", {
      draft: JSON.stringify({ channel_id: "ch1", root_id: "root1", message: "thread draft", update_at: 100 }),
    });
    expect(useDraftsStore.getState().drafts["thread:root1"]).toMatchObject({ message: "thread draft" });
  });

  it("draft_deleted removes the matching draft", () => {
    useDraftsStore.setState({
      drafts: { "channel:ch1": { message: "x", channelId: "ch1", rootId: "", updateAt: 50 } },
    });
    fireWsEvent("draft_deleted", { draft: JSON.stringify({ channel_id: "ch1" }) });
    expect(useDraftsStore.getState().drafts["channel:ch1"]).toBeUndefined();
  });
});

describe("handleOpenDialog (nested unwrap + emit)", () => {
  beforeEach(() => mountHook());

  it("emits interactive_dialog_open with a top-level dialog object", () => {
    const dialog = { title: "T", elements: [{ name: "x" }] };
    fireWsEvent("open_dialog", { trigger_id: "trig", url: "http://x", dialog });

    expect(emitMock).toHaveBeenCalledWith(
      "interactive_dialog_open",
      expect.objectContaining({ serverId: SERVER_ID, triggerId: "trig", url: "http://x", dialog }),
    );
  });

  it("parses a JSON-string dialog field", () => {
    const dialog = { title: "T", elements: [{ name: "y" }] };
    fireWsEvent("open_dialog", { trigger_id: "trig", dialog: JSON.stringify(dialog) });

    expect(emitMock).toHaveBeenCalledWith(
      "interactive_dialog_open",
      expect.objectContaining({ dialog }),
    );
  });

  it("unwraps a nested { dialog: {...} } payload when elements are not at the top level", () => {
    const inner = { title: "Inner", elements: [{ name: "z" }] };
    fireWsEvent("open_dialog", { trigger_id: "trig", dialog: { dialog: inner } });

    expect(emitMock).toHaveBeenCalledWith(
      "interactive_dialog_open",
      expect.objectContaining({ dialog: inner }),
    );
  });

  it("does not emit when there is no dialog field", () => {
    fireWsEvent("open_dialog", { trigger_id: "trig" });
    expect(emitMock).not.toHaveBeenCalledWith("interactive_dialog_open", expect.anything());
  });
});

describe("handleChannelMemberUpdated (notify props sync)", () => {
  beforeEach(() => mountHook());

  it("syncs mark_unread and notify_props to the ui store", () => {
    useUiStore.setState({ channels: [makeChannel({ id: "ch1" })] });
    fireWsEvent("channel_member_updated", {
      channelMember: JSON.stringify({
        channel_id: "ch1",
        notify_props: { mark_unread: "mention", desktop: "all" },
      }),
    });

    expect(useUiStore.getState().channels[0].mark_unread).toBe("mention");
    expect(useUiStore.getState().channelNotifyProps["ch1"]).toMatchObject({
      mark_unread: "mention",
      desktop: "all",
    });
  });
});

describe("post edit / delete handlers", () => {
  beforeEach(() => mountHook());

  it("post_edited updates the stored post message", () => {
    useMessagesStore.setState({ posts: { p1: makePost({ id: "p1", message: "before" }) } });
    fireWsEvent("post_edited", {
      post: JSON.stringify(makePost({ id: "p1", message: "after" })),
    });
    expect(useMessagesStore.getState().posts["p1"].message).toBe("after");
  });

  it("post_deleted removes the post from the channel", () => {
    useMessagesStore.setState({
      posts: { p1: makePost({ id: "p1", channel_id: "ch1" }) },
      orderByChannel: { ch1: ["p1"] },
    });
    fireWsEvent("post_deleted", {
      post: JSON.stringify(makePost({ id: "p1", channel_id: "ch1" })),
    });
    expect(useMessagesStore.getState().posts["p1"]).toBeUndefined();
    expect(useMessagesStore.getState().orderByChannel["ch1"]).toEqual([]);
  });
});
