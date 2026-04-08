import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useUiStore } from "@/stores/uiStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useTabsStore } from "@/stores/tabsStore";

interface WsStatusPayload {
  server_id: string;
  status: string;
}

interface WsEventPayload {
  server_id: string;
  event: string;
  data: Record<string, unknown>;
  broadcast: {
    channel_id: string;
    team_id: string;
    user_id: string;
  };
}

// Request notification permission on init
let notifPermission: boolean | null = null;
(async () => {
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === "granted";
  }
  notifPermission = granted;
})().catch(() => {
  notifPermission = false;
});

export function useWebSocket() {
  const activeServerId = useUiStore((s) => s.activeServerId);

  useEffect(() => {
    const unlistenStatus = listen<WsStatusPayload>("ws_status", (event) => {
      const currentServerId = useUiStore.getState().activeServerId;
      if (event.payload.server_id === currentServerId) {
        useUiStore.getState().setWsStatus(event.payload.status);
      }
    });

    const unlistenEvent = listen<WsEventPayload>("ws_event", (event) => {
      const { server_id, event: eventType, data, broadcast } = event.payload;
      const currentServerId = useUiStore.getState().activeServerId;

      if (server_id !== currentServerId) return;

      switch (eventType) {
        case "posted":
          handlePosted(data, broadcast);
          break;
        case "post_edited":
          handlePostEdited(data);
          break;
        case "post_deleted":
          handlePostDeleted(data);
          break;
        case "typing":
          handleTyping(broadcast);
          break;
        case "status_change":
          handleStatusChange(data);
          break;
        case "channel_viewed":
          handleChannelViewed(data);
          break;
        default:
          console.debug("WS event:", eventType, data);
      }
    });

    return () => {
      unlistenStatus.then((fn) => fn());
      unlistenEvent.then((fn) => fn());
    };
  }, [activeServerId]);
}

function handlePosted(
  data: Record<string, unknown>,
  broadcast: { channel_id: string },
) {
  const channelId = broadcast.channel_id;
  if (!channelId) return;

  // Parse the post JSON from the data
  let post: PostData | null = null;
  try {
    const postStr = data.post as string | undefined;
    if (postStr) {
      post = JSON.parse(postStr) as PostData;
    }
  } catch {
    // ignore parse errors
  }

  if (post) {
    if (post.root_id) {
      // Thread reply — only store post data (for reference), don't add to channel order
      useMessagesStore.getState().updatePost(post);
      // Increment reply_count on the root post so the thread indicator updates
      useMessagesStore.getState().incrementReplyCount(post.root_id);
      // Update the thread panel if this thread is open
      const { activeThreadId } = useThreadsStore.getState();
      if (activeThreadId === post.root_id) {
        useThreadsStore.getState().addThreadReply(post);
      } else {
        // Thread is not open — increment unread count only for followed threads
        const { userThreads } = useThreadsStore.getState();
        const isFollowed = userThreads.some((t) => t.id === post.root_id);
        if (isFollowed) {
          useThreadsStore.getState().incrementThreadUnread(post.root_id);
        }
      }
    } else {
      // Top-level post — add to channel order
      useMessagesStore.getState().addPost(post);
    }
  }

  // Update unread badge for non-active channels (only for top-level posts, not thread replies)
  const isThreadReply = post?.root_id;
  const { channels, activeChannelId, updateChannelMentions, users } =
    useUiStore.getState();

  // Update tab unread badge for non-active tabs (top-level posts only)
  if (!isThreadReply) {
    useTabsStore.getState().incrementTabUnread(channelId);
  }

  const channel = channels.find((ch) => ch.id === channelId);
  if (channel && channelId !== activeChannelId && !isThreadReply) {
    updateChannelMentions(
      channelId,
      channel.mention_count + 1,
      channel.msg_count,
    );

    // Send desktop notification for messages in non-active channels
    if (notifPermission && post) {
      const sender = users[post.user_id];
      const senderName = sender
        ? sender.nickname || `${sender.first_name} ${sender.last_name}`.trim() || sender.username
        : "Someone";
      const channelName = channel.display_name || channel.name;
      const preview = post.message.length > 100
        ? post.message.slice(0, 100) + "..."
        : post.message;

      sendNotification({
        title: `${senderName} in ${channelName}`,
        body: preview,
      });
    }

    // Update dock/taskbar badge count
    updateBadgeCount();
  }
}

function updateBadgeCount() {
  const { channels } = useUiStore.getState();
  const totalMentions = channels.reduce((sum, ch) => sum + ch.mention_count, 0);
  invoke("set_badge_count", { count: totalMentions }).catch(() => {});
}

function handlePostEdited(data: Record<string, unknown>) {
  try {
    const postStr = data.post as string | undefined;
    if (postStr) {
      const post = JSON.parse(postStr) as PostData;
      useMessagesStore.getState().updatePost(post);
      // Also update in thread panel if visible
      useThreadsStore.getState().updateThreadPost(post);
    }
  } catch {
    // ignore parse errors
  }
}

function handlePostDeleted(data: Record<string, unknown>) {
  try {
    const postStr = data.post as string | undefined;
    if (postStr) {
      const post = JSON.parse(postStr) as PostData;
      useMessagesStore.getState().removePost(post.id);
      // Also remove from thread panel
      if (post.root_id) {
        useThreadsStore.getState().removeThreadPost(post.id, post.root_id);
      }
    }
  } catch {
    // ignore parse errors
  }
}

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function handleTyping(broadcast: { channel_id: string; user_id: string }) {
  const { channel_id: channelId, user_id: userId } = broadcast;
  if (!channelId || !userId) return;

  const key = `${channelId}:${userId}`;
  useUiStore.getState().addTypingUser(channelId, userId);

  // Clear previous timer
  const existing = typingTimers.get(key);
  if (existing) clearTimeout(existing);

  // Remove after 5 seconds
  const timer = setTimeout(() => {
    useUiStore.getState().removeTypingUser(channelId, userId);
    typingTimers.delete(key);
  }, 5000);
  typingTimers.set(key, timer);
}

function handleStatusChange(data: Record<string, unknown>) {
  const userId = data.user_id as string;
  const status = data.status as string;
  if (userId && status) {
    useUiStore.getState().setUserStatus(userId, status);
  }
}

function handleChannelViewed(data: Record<string, unknown>) {
  const channelId = data.channel_id as string;
  if (!channelId) return;

  const { updateChannelMentions } = useUiStore.getState();
  updateChannelMentions(channelId, 0, 0);
  updateBadgeCount();
}
