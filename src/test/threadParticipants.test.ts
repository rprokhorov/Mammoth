import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { fetchThreadParticipants } from "@/utils/threadParticipants";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useUiStore } from "@/stores/uiStore";

function root(id: string, channel_id = "a"): PostData {
  return { id, channel_id, user_id: "user", root_id: "", message: "", post_type: "",
    create_at: 1, update_at: 1, delete_at: 0, edit_at: 0, reply_count: 1,
    is_pinned: false, file_ids: [], props: {} };
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useMessagesStore.setState(useMessagesStore.getInitialState());
  useThreadsStore.setState(useThreadsStore.getInitialState());
  useUiStore.setState({ activeServerId: "server" });
});

it("fetches only roots from the requested channel and reuses cached participants", async () => {
  const a = root("a1");
  const b = root("b1", "b");
  useMessagesStore.getState().setChannelPosts("a", [a.id], { [a.id]: a });
  useMessagesStore.getState().setChannelPosts("b", [b.id], { [b.id]: b });
  vi.mocked(invoke).mockResolvedValue({ posts: { [a.id]: a } });
  await fetchThreadParticipants("a", "server");
  await fetchThreadParticipants("a", "server");
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith("get_post_thread", { serverId: "server", postId: "a1" });
});

it("limits concurrency and coalesces overlapping batches", async () => {
  const roots = Array.from({ length: 12 }, (_, i) => root(String(i)));
  useMessagesStore.getState().setChannelPosts("a", roots.map((p) => p.id),
    Object.fromEntries(roots.map((p) => [p.id, p])));
  let active = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  vi.mocked(invoke).mockImplementation(() => {
    active++;
    peak = Math.max(peak, active);
    return new Promise((resolve) => releases.push(() => { active--; resolve({ posts: {} }); }));
  });
  const first = fetchThreadParticipants("a", "server");
  const second = fetchThreadParticipants("a", "server");
  expect(invoke).toHaveBeenCalledTimes(4);
  for (let i = 0; i < 12; i++) {
    await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
    releases.shift()!();
  }
  await Promise.all([first, second]);
  expect(peak).toBe(4);
  expect(invoke).toHaveBeenCalledTimes(12);
});

it("discards results and queued work after changing servers", async () => {
  const roots = Array.from({ length: 8 }, (_, i) => root(String(i)));
  useMessagesStore.getState().setChannelPosts("a", roots.map((p) => p.id),
    Object.fromEntries(roots.map((p) => [p.id, p])));
  const releases: Array<() => void> = [];
  vi.mocked(invoke).mockImplementation(() => new Promise((resolve) =>
    releases.push(() => resolve({ posts: { root: roots[0] } })),
  ));
  const batch = fetchThreadParticipants("a", "server");
  useUiStore.setState({ activeServerId: "other" });
  releases.forEach((release) => release());
  await batch;
  expect(invoke).toHaveBeenCalledTimes(4);
  expect(useThreadsStore.getState().threadParticipants).toEqual({});
});

it("allows retry after failure", async () => {
  const a = root("a1");
  useMessagesStore.getState().setChannelPosts("a", [a.id], { [a.id]: a });
  vi.mocked(invoke).mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ posts: { a } });
  await fetchThreadParticipants("a", "server");
  await fetchThreadParticipants("a", "server");
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(useThreadsStore.getState().threadParticipants.a1).toEqual(["user"]);
});
