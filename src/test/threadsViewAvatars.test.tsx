import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ThreadsView } from "@/components/message/ThreadsView";
import { useUiStore } from "@/stores/uiStore";
import { useThreadsStore } from "@/stores/threadsStore";

const AUTHOR = {
  id: "author-1", username: "jdoe", first_name: "Jane",
  last_name: "Doe", nickname: "", email: "j@example.com",
};

function threadResponse() {
  return {
    threads: [{
      id: "t1", reply_count: 2, unread_replies: 0, unread_mentions: 0,
      last_reply_at: 1_000_000, last_viewed_at: 0, participants: [],
      post: {
        id: "t1", channel_id: "c1", user_id: AUTHOR.id, root_id: "",
        message: "root post", post_type: "", create_at: 1_000_000,
        update_at: 1_000_000, delete_at: 0, edit_at: 0, reply_count: 2,
        is_pinned: false, file_ids: [], props: {},
      },
    }],
    total: 1, total_unread_threads: 0, total_unread_mentions: 0,
  };
}

// The avatar cache is module-level and keyed by serverId, so each test gets a
// fresh server id to stay isolated from the others.
let serverNumber = 0;
let props = { serverId: "server-0", teamId: "team", currentUserId: "me" };

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  const serverId = `threads-server-${serverNumber++}`;
  props = { serverId, teamId: "team", currentUserId: "me" };
  useThreadsStore.setState(useThreadsStore.getInitialState());
  useUiStore.setState({ channels: [], activeServerId: serverId, users: {} });
});

afterEach(cleanup);

describe("threads list avatars", () => {
  it("fetches authors missing from the user cache", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "get_user_threads") return Promise.resolve(threadResponse());
      if (command === "get_users_by_ids") return Promise.resolve([AUTHOR]);
      return Promise.resolve(null);
    });

    render(<ThreadsView {...props} />);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("get_users_by_ids", {
        serverId: props.serverId, userIds: [AUTHOR.id],
      }),
    );
  });

  it("renders the author name once the profile arrives, not a truncated id", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "get_user_threads") return Promise.resolve(threadResponse());
      if (command === "get_users_by_ids") return Promise.resolve([AUTHOR]);
      return Promise.resolve(null);
    });

    const { container } = render(<ThreadsView {...props} />);

    // Requires a live store subscription: the name only appears after the
    // profile fetch resolves, which is a separate update from the thread load.
    await waitFor(() =>
      expect(container.querySelector(".thread-list-author")?.textContent).toBe("Jane Doe"),
    );
  });

  it("requests the avatar image for the thread author", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "get_user_threads") return Promise.resolve(threadResponse());
      if (command === "get_users_by_ids") return Promise.resolve([AUTHOR]);
      if (command === "get_user_avatar") return Promise.resolve({ data_url: "img-data" });
      return Promise.resolve(null);
    });

    const { container } = render(<ThreadsView {...props} />);

    await waitFor(() => {
      const img = container.querySelector("img.user-avatar-img");
      expect(img?.getAttribute("src")).toBe("img-data");
    });
  });

  it("falls back to initials when the author has no avatar", async () => {
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "get_user_threads") return Promise.resolve(threadResponse());
      if (command === "get_users_by_ids") return Promise.resolve([AUTHOR]);
      return Promise.resolve(null);
    });

    const { container } = render(<ThreadsView {...props} />);

    await waitFor(() =>
      expect(container.querySelector(".user-avatar-placeholder")?.textContent).toBe("J"),
    );
  });
});
