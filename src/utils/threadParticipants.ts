import { invoke } from "@tauri-apps/api/core";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useUiStore } from "@/stores/uiStore";

const MAX_CONCURRENT = 4;
const pending = new Map<string, Promise<void>>();
const queue: Array<() => Promise<void>> = [];
let active = 0;

function drain() {
  while (active < MAX_CONCURRENT && queue.length) {
    const task = queue.shift()!;
    active++;
    void task().finally(() => { active--; drain(); });
  }
}

function fetchParticipants(serverId: string, rootId: string): Promise<void> {
  const key = `${serverId}:${rootId}`;
  const existing = pending.get(key);
  if (existing) return existing;
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => { finish = resolve; });
  pending.set(key, promise);
  queue.push(async () => {
    try {
      // A queued request still belongs to the server that scheduled it.
      if (useUiStore.getState().activeServerId !== serverId) return;
      if (useThreadsStore.getState().threadParticipants[rootId]) return;
      const response = await invoke<{ posts: Record<string, PostData> }>(
        "get_post_thread", { serverId, postId: rootId },
      );
      if (useUiStore.getState().activeServerId !== serverId) return;
      const posts = Object.values(response.posts)
        .filter((post) => !post.delete_at)
        .sort((a, b) => a.create_at - b.create_at);
      const participants = [...new Set(posts.map((post) => post.user_id))].slice(0, 3);
      useThreadsStore.getState().setThreadParticipants(rootId, participants);
    } catch {
      // Decorative avatars must not prevent the channel from loading; retry on the next load.
    } finally {
      pending.delete(key);
      finish();
    }
  });
  drain();
  return promise;
}

/** Only inspect this channel's loaded roots, including computed reply counts. */
export async function fetchThreadParticipants(channelId: string, serverId: string): Promise<void> {
  const { orderByChannel, posts } = useMessagesStore.getState();
  const roots = new Set((orderByChannel[channelId] ?? []).filter((id) => {
    const post = posts[id];
    return post && post.channel_id === channelId && !post.root_id && !post.delete_at
      && post.reply_count > 0;
  }));
  await Promise.all([...roots].map((id) => fetchParticipants(serverId, id)));
}
