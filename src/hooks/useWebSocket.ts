import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { useUiStore } from "@/stores/uiStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useReactionsStore } from "@/stores/reactionsStore";

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
          handleChannelViewed(data, broadcast);
          break;
        case "multiple_channels_viewed":
          handleMultipleChannelsViewed(data);
          break;
        case "thread_updated":
          handleThreadUpdated(data);
          break;
        case "thread_follow_changed":
          handleThreadFollowChanged(data);
          break;
        case "ephemeral_message":
          handleEphemeralMessage(data, broadcast);
          break;
        case "reaction_added":
          handleReactionAdded(data, broadcast);
          break;
        case "reaction_removed":
          handleReactionRemoved(data);
          break;
        case "open_dialog":
          handleOpenDialog(data, server_id);
          break;
        case "channel_member_updated":
          handleChannelMemberUpdated(data);
          break;
        default:
          console.log("WS event (unhandled):", eventType, JSON.stringify(data));
      }
    });

    return () => {
      unlistenStatus.then((fn) => fn());
      unlistenEvent.then((fn) => fn());
    };
  }, [activeServerId]);
}

function isMentioned(
  post: PostData,
  _channel: { mark_unread?: string },
  _channelId: string,
): boolean {
  if (post.post_type && post.post_type.startsWith("system_")) return false;
  const { currentUserId, users } = useUiStore.getState();
  if (!currentUserId) return false;
  const currentUser = users[currentUserId];
  const username = currentUser?.username ?? "";
  const msg = post.message.toLowerCase();
  const mentionedExplicitly = username ? msg.includes(`@${username}`) : false;
  const mentionedAll = msg.includes("@channel") || msg.includes("@all") || msg.includes("@here");
  return mentionedExplicitly || mentionedAll;
}

function shouldNotify(
  post: PostData,
  channel: { mark_unread?: string },
  channelId: string,
): boolean {
  // Skip system messages (join/leave/add/remove etc.)
  if (post.post_type && post.post_type.startsWith("system_")) return false;

  // Skip muted channels
  if (channel.mark_unread === "none") return false;

  const { channelNotifyProps, currentUserId, users } = useUiStore.getState();
  const notifyProps = channelNotifyProps[channelId];
  const desktopPref = notifyProps?.desktop ?? "default";

  // "none" — user explicitly disabled notifications for this channel
  if (desktopPref === "none") return false;

  // "mention" — only notify if post mentions current user or @channel/@all
  if (desktopPref === "mention" || channel.mark_unread === "mention") {
    if (!currentUserId) return false;
    const currentUser = users[currentUserId];
    const username = currentUser?.username ?? "";
    const msg = post.message.toLowerCase();
    const mentionedExplicitly = username && msg.includes(`@${username}`);
    const mentionedAll = msg.includes("@channel") || msg.includes("@all") || msg.includes("@here");
    return mentionedExplicitly || mentionedAll;
  }

  // "all" or "default" — notify for all messages
  return true;
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
  const isSystemMessage = post?.post_type && post.post_type.startsWith("system_");
  const { channels, activeChannelId, users } =
    useUiStore.getState();

  // Update tab unread badge for non-active tabs (top-level, non-system posts only)
  if (!isThreadReply && !isSystemMessage) {
    useTabsStore.getState().incrementTabUnread(channelId);
  }

  const channel = channels.find((ch) => ch.id === channelId);
  if (channel && channelId !== activeChannelId && !isThreadReply && !isSystemMessage) {
    const hasMention = post ? isMentioned(post, channel, channelId) : false;
    useUiStore.getState().incrementChannelUnread(channelId, hasMention);

    // Send desktop notification for messages in non-active channels
    if (notifPermission && post && shouldNotify(post, channel, channelId)) {
      const sender = users[post.user_id];
      const senderUsername = sender?.username ?? "someone";
      const senderName = sender
        ? sender.nickname || `${sender.first_name} ${sender.last_name}`.trim() || sender.username
        : "Someone";

      let notifTitle: string;
      if (channel.channel_type === "D") {
        notifTitle = `@${senderUsername} in Direct Message`;
      } else if (channel.channel_type === "G") {
        const groupName = channel.display_name || "Group Message";
        notifTitle = `@${senderUsername} in ${groupName}`;
      } else {
        const channelName = channel.display_name || channel.name;
        notifTitle = `${senderName} in ${channelName}`;
      }

      const preview = post.message.length > 100
        ? post.message.slice(0, 100) + "..."
        : post.message;

      invoke("show_notification", {
        title: notifTitle,
        body: preview,
        channelId,
      }).catch(() => {});
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

function handleThreadFollowChanged(data: Record<string, unknown>) {
  const threadId = data.thread_id as string | undefined;
  const state = data.state as boolean | undefined;
  if (threadId !== undefined && state !== undefined) {
    useThreadsStore.getState().updateThreadFollowing(threadId, state);
  }
}

function handleThreadUpdated(data: Record<string, unknown>) {
  try {
    const threadStr = data.thread as string | undefined;
    if (!threadStr) return;
    const thread = JSON.parse(threadStr) as { id: string; is_following: boolean };
    if (thread.id) {
      useThreadsStore.getState().updateThreadFollowing(thread.id, thread.is_following);
    }
  } catch {
    // ignore parse errors
  }
}

function handleChannelViewed(
  data: Record<string, unknown>,
  broadcast: { channel_id: string },
) {
  // Mattermost sends channel_id in data; some versions use broadcast.channel_id
  const channelId = (data.channel_id as string | undefined) || broadcast.channel_id;
  if (!channelId) return;

  // Skip if this is the currently active channel — we already cleared it locally
  const { activeChannelId, activeServerId } = useUiStore.getState();
  if (channelId === activeChannelId) return;

  // Optimistically clear unread, then fetch authoritative counts from server
  useUiStore.getState().clearChannelUnread(channelId);
  updateBadgeCount();

  // Sync authoritative msg_count/mention_count from server
  if (activeServerId) {
    invoke<{ msg_count: number; mention_count: number }>("get_channel_member", {
      serverId: activeServerId,
      channelId,
    }).then((member) => {
      useUiStore.getState().updateChannelMentions(channelId, member.mention_count, member.msg_count);
      updateBadgeCount();
    }).catch(() => {});
  }
}

function handleMultipleChannelsViewed(data: Record<string, unknown>) {
  // data.channel_times: { [channelId]: timestampMs }
  const channelTimes = data.channel_times as Record<string, number> | undefined;
  if (!channelTimes) return;

  const { activeChannelId, activeServerId } = useUiStore.getState();

  for (const channelId of Object.keys(channelTimes)) {
    // Skip currently active channel — already cleared locally
    if (channelId === activeChannelId) continue;

    useUiStore.getState().clearChannelUnread(channelId);

    // Fetch authoritative counts from server
    if (activeServerId) {
      invoke<{ msg_count: number; mention_count: number }>("get_channel_member", {
        serverId: activeServerId,
        channelId,
      }).then((member) => {
        useUiStore.getState().updateChannelMentions(channelId, member.mention_count, member.msg_count);
      }).catch(() => {});
    }
  }

  updateBadgeCount();
}

function handleEphemeralMessage(
  data: Record<string, unknown>,
  broadcast: { channel_id: string },
) {
  try {
    const postStr = data.post as string | undefined;
    if (!postStr) return;
    const post = JSON.parse(postStr) as PostData;
    // Use broadcast channel_id if post doesn't have one
    if (!post.channel_id && broadcast.channel_id) {
      post.channel_id = broadcast.channel_id;
    }
    if (!post.channel_id) return;
    // Ephemeral posts are added to the channel feed just like regular posts
    useMessagesStore.getState().addPost(post);
  } catch {
    // ignore parse errors
  }
}

function addReactionToPost(reaction: { user_id: string; post_id: string; emoji_name: string; create_at: number }) {
  const messagesStore = useMessagesStore.getState();
  const post = messagesStore.posts[reaction.post_id];
  if (!post) return;

  const existing = post.metadata?.reactions || [];
  // Avoid duplicates
  const alreadyExists = existing.some(
    (r) => r.user_id === reaction.user_id && r.emoji_name === reaction.emoji_name,
  );
  if (alreadyExists) return;

  const updatedPost = {
    ...post,
    metadata: {
      ...post.metadata,
      reactions: [...existing, reaction],
    },
  };
  messagesStore.updatePost(updatedPost);
  useThreadsStore.getState().updateThreadPost(updatedPost);
}

function removeReactionFromPost(reaction: { user_id: string; post_id: string; emoji_name: string }) {
  const messagesStore = useMessagesStore.getState();
  const post = messagesStore.posts[reaction.post_id];
  if (!post) return;

  const existing = post.metadata?.reactions || [];
  const filtered = existing.filter(
    (r) => !(r.user_id === reaction.user_id && r.emoji_name === reaction.emoji_name),
  );
  if (filtered.length === existing.length) return; // nothing changed

  const updatedPost = {
    ...post,
    metadata: {
      ...post.metadata,
      reactions: filtered,
    },
  };
  messagesStore.updatePost(updatedPost);
  useThreadsStore.getState().updateThreadPost(updatedPost);
}

function handleReactionAdded(
  data: Record<string, unknown>,
  broadcast: { channel_id: string; user_id: string },
) {
  try {
    const reactionStr = data.reaction as string | undefined;
    if (!reactionStr) return;
    const reaction = JSON.parse(reactionStr) as {
      user_id: string;
      post_id: string;
      emoji_name: string;
      create_at: number;
    };

    // Update the post's reactions in the store so the chip appears under the post
    addReactionToPost(reaction);

    // Only notify if someone else reacted to MY post
    const currentUserId = useUiStore.getState().currentUserId;
    if (!currentUserId) return;
    if (reaction.user_id === currentUserId) return;

    const post = useMessagesStore.getState().posts[reaction.post_id];
    if (!post) return;
    if (post.user_id !== currentUserId) return;

    const channelId = broadcast.channel_id || post.channel_id;

    useReactionsStore.getState().addNotification({
      id: `${reaction.post_id}_${reaction.user_id}_${reaction.emoji_name}_${reaction.create_at}`,
      postId: reaction.post_id,
      rootId: post.root_id ?? "",
      channelId,
      emojiName: reaction.emoji_name,
      reactorUserId: reaction.user_id,
      postAuthorUserId: post.user_id,
      postMessage: post.message,
      createAt: reaction.create_at,
      read: false,
    });
  } catch {
    // ignore parse errors
  }
}

function handleReactionRemoved(
  data: Record<string, unknown>,
) {
  try {
    const reactionStr = data.reaction as string | undefined;
    if (!reactionStr) return;
    const reaction = JSON.parse(reactionStr) as {
      user_id: string;
      post_id: string;
      emoji_name: string;
    };

    removeReactionFromPost(reaction);
  } catch {
    // ignore parse errors
  }
}

function handleChannelMemberUpdated(data: Record<string, unknown>) {
  try {
    const memberStr = data.channelMember as string | undefined;
    if (!memberStr) return;
    const member = JSON.parse(memberStr) as {
      channel_id: string;
      notify_props?: Record<string, string>;
    };
    if (!member.channel_id) return;
    const notifyProps = member.notify_props;
    if (notifyProps) {
      // Sync mark_unread to channels store (drives sidebar mute indicator)
      if (notifyProps.mark_unread !== undefined) {
        useUiStore.getState().updateChannelMarkUnread(member.channel_id, notifyProps.mark_unread);
      }
      // Sync full notify_props to cache (drives notification prefs panel)
      useUiStore.getState().updateChannelNotifyProps(member.channel_id, notifyProps);
    }
  } catch {
    // ignore parse errors
  }
}

function handleOpenDialog(data: Record<string, unknown>, serverId: string) {
  console.log("open_dialog WS event data:", JSON.stringify(data));
  try {
    // trigger_id and url are always at the top level of data
    const triggerId = (data.trigger_id as string | undefined) ?? "";
    const url = (data.url as string | undefined) ?? "";

    // dialog field may be a JSON string (Mattermost standard) or already an object
    let dialog: unknown = null;
    if (typeof data.dialog === "string") {
      dialog = JSON.parse(data.dialog);
    } else if (data.dialog && typeof data.dialog === "object") {
      dialog = data.dialog;
    }

    if (!dialog) {
      console.log("open_dialog: no dialog field in payload");
      return;
    }

    // Unwrap nested { dialog: {...} } if elements not at top level
    const dialogObj = dialog as Record<string, unknown>;
    if (!Array.isArray(dialogObj.elements) && dialogObj.dialog && typeof dialogObj.dialog === "object") {
      dialog = dialogObj.dialog;
    }

    emit("interactive_dialog_open", {
      serverId,
      triggerId,
      url,
      dialog,
    });
  } catch (e) {
    console.error("open_dialog parse error:", e);
  }
}
