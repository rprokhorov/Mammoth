import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { MessageList } from "@/components/message/MessageList";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";
import { useThreadsStore } from "@/stores/threadsStore";

vi.mock("@/components/message/MessageItem", () => ({
  MessageItem: ({ post }: { post: PostData }) => <div>{post.message}</div>,
}));

function page(channelId: string, count: number) {
  const order = Array.from({ length: count }, (_, i) => `${channelId}-${count - i}`);
  const posts = Object.fromEntries(order.map((id, i) => [id, {
    id, channel_id: channelId, user_id: "user", root_id: "", message: id,
    post_type: "", create_at: count - i, update_at: count - i, delete_at: 0,
    edit_at: 0, reply_count: 0, is_pinned: false, file_ids: [], props: {},
  } satisfies PostData]));
  return { order, posts };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const props = { serverId: "server", currentUserId: "user", onEditPost: vi.fn() };

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useMessagesStore.setState(useMessagesStore.getInitialState());
  useThreadsStore.setState(useThreadsStore.getInitialState());
  useUiStore.setState({ channels: [], activeServerId: "server", users: {
    user: { id: "user", username: "user", first_name: "", last_name: "", nickname: "", email: "" },
  } });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("message history loading", () => {
  it("anchors history to the oldest post after a live message arrives", async () => {
    const initial = page("a", 60);
    const older = deferred<ReturnType<typeof page>>();
    vi.mocked(invoke).mockImplementation((command, args) => {
      if (command === "get_posts") {
        const options = args as { before?: string; page: number };
        return (options.before || options.page > 0) ? older.promise : Promise.resolve(initial);
      }
      return Promise.resolve(null);
    });
    const { container } = render(<MessageList {...props} channelId="a" />);
    await waitFor(() => expect(useMessagesStore.getState().loading).toBe(false));
    act(() => useMessagesStore.getState().addPost({ ...initial.posts["a-60"], id: "live" }));
    const list = container.querySelector(".message-list")!;
    fireEvent.scroll(list);
    fireEvent.scroll(list);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "get_posts")).toEqual([
      ["get_posts", { ...propsToRequest("a"), page: 0, perPage: 60 }],
      ["get_posts", { ...propsToRequest("a"), page: 0, perPage: 30, before: "a-1" }],
    ]);
    await act(async () => older.resolve(page("a", 0)));
  });

  it("ignores an older-page response after switching channels", async () => {
    const olderA = deferred<ReturnType<typeof page>>();
    vi.mocked(invoke).mockImplementation((command, args) => {
      if (command === "get_posts") {
        const options = args as { channelId: string; before?: string; page: number };
        if (options.before || options.page > 0) {
          return options.channelId === "a" ? olderA.promise : Promise.resolve(page("b", 0));
        }
        return Promise.resolve(page(options.channelId, 60));
      }
      return Promise.resolve(null);
    });
    const { container, rerender } = render(<MessageList {...props} channelId="a" />);
    await waitFor(() => expect(useMessagesStore.getState().loading).toBe(false));
    fireEvent.scroll(container.querySelector(".message-list")!);
    rerender(<MessageList {...props} channelId="b" />);
    await waitFor(() => expect(useMessagesStore.getState().orderByChannel.b).toHaveLength(60));
    await act(async () => olderA.resolve(page("a", 0)));
    fireEvent.scroll(container.querySelector(".message-list")!);
    expect(invoke).toHaveBeenCalledWith("get_posts", {
      ...propsToRequest("b"), page: 0, perPage: 30, before: "b-1",
    });
  });

  it("does not start a network request for a channel abandoned during disk loading", async () => {
    const diskA = deferred<null>();
    vi.mocked(invoke).mockImplementation((command, args) => {
      const options = args as { channelId?: string };
      if (command === "load_posts_cache" && options.channelId === "a") return diskA.promise;
      if (command === "get_posts") return Promise.resolve(page(options.channelId!, 1));
      return Promise.resolve(null);
    });
    const { rerender } = render(<MessageList {...props} channelId="a" />);
    rerender(<MessageList {...props} channelId="b" />);
    await act(async () => diskA.resolve(null));
    expect(vi.mocked(invoke).mock.calls.filter(([command, args]) =>
      command === "get_posts" && (args as { channelId: string }).channelId === "a",
    )).toHaveLength(0);
  });
});

function propsToRequest(channelId: string) { return { serverId: "server", channelId }; }
