import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { MessageList } from "@/components/message/MessageList";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";
import { useThreadsStore } from "@/stores/threadsStore";

const DAY = 24 * 60 * 60 * 1000;

function post(overrides: Partial<PostData> & { id: string; create_at: number }): PostData {
  return {
    channel_id: "a", user_id: "user", root_id: "", message: overrides.id,
    post_type: "", update_at: overrides.create_at, delete_at: 0, edit_at: 0,
    reply_count: 0, is_pinned: false, file_ids: [], props: {}, ...overrides,
  };
}

/** Builds a get_posts response; newest-first order, as the API returns it. */
function response(posts: PostData[]) {
  const sorted = [...posts].sort((a, b) => b.create_at - a.create_at);
  return {
    order: sorted.map((p) => p.id),
    posts: Object.fromEntries(sorted.map((p) => [p.id, p])),
  };
}

function separators(container: HTMLElement) {
  return [...container.querySelectorAll(".date-separator")].map((el) => el.textContent);
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

function renderWith(posts: PostData[]) {
  vi.mocked(invoke).mockImplementation((command) => {
    if (command === "get_posts") return Promise.resolve(response(posts));
    return Promise.resolve(null);
  });
  return render(<MessageList {...props} channelId="a" />);
}

describe("date separators", () => {
  it("omits days whose only posts are joins and leaves", async () => {
    const { container } = renderWith([
      post({ id: "real", create_at: 1_000_000 }),
      post({ id: "join", create_at: 1_000_000 + DAY, post_type: "system_join_channel" }),
      post({ id: "leave", create_at: 1_000_000 + 2 * DAY, post_type: "system_leave_channel" }),
    ]);

    await waitFor(() => expect(useMessagesStore.getState().loading).toBe(false));
    await waitFor(() => expect(separators(container)).toHaveLength(1));
    expect(container.textContent).toContain("real");
  });

  it("omits days whose only posts are thread replies", async () => {
    const { container } = renderWith([
      post({ id: "root", create_at: 1_000_000 }),
      post({ id: "reply", create_at: 1_000_000 + DAY, root_id: "root" }),
    ]);

    await waitFor(() => expect(useMessagesStore.getState().loading).toBe(false));
    await waitFor(() => expect(separators(container)).toHaveLength(1));
  });

  it("keeps a separator for a day that still has a visible post", async () => {
    const { container } = renderWith([
      post({ id: "first", create_at: 1_000_000 }),
      post({ id: "join", create_at: 1_000_000 + DAY, post_type: "system_join_channel" }),
      post({ id: "second", create_at: 1_000_000 + DAY + 60_000 }),
    ]);

    await waitFor(() => expect(useMessagesStore.getState().loading).toBe(false));
    await waitFor(() => expect(separators(container)).toHaveLength(2));
    expect(container.textContent).toContain("second");
  });

  it("does not let a hidden post break message grouping", async () => {
    const { container } = renderWith([
      post({ id: "first", create_at: 1_000_000 }),
      // A different user, so a stale lastUserId would make "second" look like
      // the start of a new group.
      post({
        id: "join", create_at: 1_000_000 + 1_000,
        user_id: "joiner", post_type: "system_join_channel",
      }),
      post({ id: "second", create_at: 1_000_000 + 2_000 }),
    ]);

    await waitFor(() => expect(useMessagesStore.getState().loading).toBe(false));
    // Both posts are from the same user seconds apart, so only the first
    // carries an avatar/header regardless of the join between them.
    await waitFor(() => expect(container.querySelectorAll(".message-item")).toHaveLength(2));
    expect(container.querySelectorAll(".message-header")).toHaveLength(1);
  });
});
