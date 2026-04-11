import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useReactionsStore, type ReactionNotification } from "@/stores/reactionsStore";
import { useUiStore } from "@/stores/uiStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { useTabsStore } from "@/stores/tabsStore";
import { primeLastViewedSnapshot } from "@/stores/lastViewedSnapshot";
import { ReactionEmoji } from "@/components/message/ReactionsBar";
import { UserPopover } from "@/components/user/UserPopover";
import { UserAvatar } from "@/components/common/UserAvatar";

interface ReactionOnMyPost {
  post_id: string;
  post_message: string;
  channel_id: string;
  reactor_user_id: string;
  emoji_name: string;
  create_at: number;
}

interface ReactionsViewProps {
  currentUserId: string | null;
  serverId: string;
}

export function ReactionsView({ currentUserId, serverId }: ReactionsViewProps) {
  const notifications = useReactionsStore((s) => s.notifications);
  const unreadCount = useReactionsStore((s) => s.unreadCount);
  const users = useUiStore((s) => s.users);
  const activeTeamId = useUiStore((s) => s.activeTeamId);
  const [loading, setLoading] = useState(false);

  const [popoverUserId, setPopoverUserId] = useState<string | null>(null);
  const popoverAnchorRef = useRef<HTMLDivElement | null>(null);

  // Load historical reactions on mount
  useEffect(() => {
    if (serverId && activeTeamId) {
      loadHistoricalReactions();
    }
  }, [serverId, activeTeamId]);

  // Mark all as read when viewing
  useEffect(() => {
    if (unreadCount > 0) {
      useReactionsStore.getState().markAllRead();
    }
  }, []);

  async function loadHistoricalReactions() {
    setLoading(true);
    try {
      const results = await invoke<ReactionOnMyPost[]>("get_reactions_on_my_posts", {
        serverId,
        teamId: activeTeamId,
      });
      // Add historical reactions that aren't already in the store
      const store = useReactionsStore.getState();
      const existingIds = new Set(store.notifications.map((n) => n.id));
      for (const r of results) {
        const id = `${r.post_id}_${r.reactor_user_id}_${r.emoji_name}_${r.create_at}`;
        if (!existingIds.has(id)) {
          store.addNotification({
            id,
            postId: r.post_id,
            channelId: r.channel_id,
            emojiName: r.emoji_name,
            reactorUserId: r.reactor_user_id,
            postAuthorUserId: currentUserId ?? "",
            postMessage: r.post_message,
            createAt: r.create_at,
            read: true, // historical ones are already "read"
          });
        }
      }
    } catch (e) {
      console.error("Failed to load historical reactions:", e);
    } finally {
      setLoading(false);
    }
  }

  function getUserName(userId: string): string {
    const u = users[userId];
    if (!u) return userId.slice(0, 8);
    return u.nickname || `${u.first_name} ${u.last_name}`.trim() || u.username;
  }

  function handleGoToChannel(e: React.MouseEvent, channelId: string) {
    e.stopPropagation();
    navigateToChannel(channelId);
  }

  function navigateToChannel(channelId: string, postId?: string) {
    const uiStore = useUiStore.getState();
    const ch = uiStore.channels.find((c) => c.id === channelId);
    if (ch) primeLastViewedSnapshot(ch.id, ch.last_viewed_at);
    uiStore.setActiveChannelId(channelId);
    uiStore.setMainSubView("channels");
    useTabsStore.getState().navigateDefaultTab(channelId);
    if (postId) {
      useMessagesStore.getState().setScrollToPostId(postId);
    }
  }

  function handleGoToPost(e: React.MouseEvent, channelId: string, postId: string) {
    e.stopPropagation();
    navigateToChannel(channelId, postId);
  }

  async function handleOpenDm(e: React.MouseEvent, userId: string) {
    e.stopPropagation();
    try {
      const channel = await invoke<{ id: string }>("create_direct_channel", {
        serverId,
        otherUserId: userId,
      });
      const uiStore = useUiStore.getState();
      uiStore.setActiveChannelId(channel.id);
      uiStore.setMainSubView("channels");
      useTabsStore.getState().navigateDefaultTab(channel.id);
    } catch (err) {
      console.error("Failed to open DM:", err);
    }
  }

  function handleAvatarClick(e: React.MouseEvent, userId: string) {
    e.stopPropagation();
    popoverAnchorRef.current = e.currentTarget as HTMLDivElement;
    setPopoverUserId(userId);
  }

  function getChannelLabel(channelId: string): string | null {
    const store = useUiStore.getState();
    const ch = store.channels.find((c) => c.id === channelId);
    if (!ch) return null;
    if (ch.channel_type === "D") {
      const parts = ch.name.split("__");
      for (const part of parts) {
        if (part === currentUserId) continue;
        const u = store.users[part];
        if (u) return u.nickname || `${u.first_name} ${u.last_name}`.trim() || u.username;
      }
      return ch.display_name || "Direct Message";
    }
    return ch.display_name || ch.name;
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="threads-view">
      <div className="threads-view-header">
        <h3>Reactions</h3>
      </div>

      <div className="threads-list">
        {loading && notifications.length === 0 ? (
          <div className="threads-loading">
            <div className="spinner small" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="threads-empty">
            <p className="muted">No reaction notifications yet</p>
          </div>
        ) : (
          [...notifications].sort((a, b) => b.createAt - a.createAt).map((n: ReactionNotification) => {
            const reactorName = getUserName(n.reactorUserId);
            const channelLabel = getChannelLabel(n.channelId);
            const preview = n.postMessage.length > 80
              ? n.postMessage.slice(0, 80) + "..."
              : n.postMessage;

            return (
              <div
                key={n.id}
                className="thread-list-item"
                onClick={(e) => handleGoToPost(e, n.channelId, n.postId)}
                style={{ cursor: "pointer" }}
              >
                <div
                  className="thread-list-avatar"
                  onClick={(e) => handleAvatarClick(e, n.reactorUserId)}
                  style={{ cursor: "pointer" }}
                  title={`View profile of ${reactorName}`}
                >
                  <UserAvatar userId={n.reactorUserId} username={reactorName} size={32} />
                </div>
                <div className="thread-list-content">
                  <div className="thread-list-header">
                    <div className="thread-list-author-row">
                      <span
                        className="thread-list-author reaction-clickable"
                        onClick={(e) => handleOpenDm(e, n.reactorUserId)}
                        title={`Open DM with ${reactorName}`}
                      >
                        {reactorName}
                      </span>
                      {channelLabel && (
                        <span className="thread-channel-link">
                          in{" "}
                          <span
                            className="reaction-clickable"
                            onClick={(e) => handleGoToChannel(e, n.channelId)}
                            title={`Go to ${channelLabel}`}
                          >
                            {channelLabel}
                          </span>
                        </span>
                      )}
                    </div>
                    <span className="thread-list-time">{formatTime(n.createAt)}</span>
                  </div>
                  <div className="thread-list-preview">
                    reacted with <span className="reaction-emoji" style={{ display: "inline-flex", verticalAlign: "middle", fontSize: "1.2em" }}><ReactionEmoji name={n.emojiName} /></span> to: {preview}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {popoverUserId && (
        <UserPopover
          userId={popoverUserId}
          serverId={serverId}
          anchorEl={popoverAnchorRef.current}
          onClose={() => setPopoverUserId(null)}
        />
      )}
    </div>
  );
}
