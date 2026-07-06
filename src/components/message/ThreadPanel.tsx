import { useEffect, useRef, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useThreadsStore } from "@/stores/threadsStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";
import { useTabsStore } from "@/stores/tabsStore";
import { primeLastViewedSnapshot } from "@/stores/lastViewedSnapshot";
import { MessageItem } from "./MessageItem";
import { MessageComposer } from "./MessageComposer";

interface PostsResponse {
  order: string[];
  posts: Record<string, PostData>;
}

interface ThreadPanelProps {
  serverId: string;
  currentUserId: string | null;
  width?: number;
}

const EMPTY_ORDER: string[] = [];

export function ThreadPanel({ serverId, currentUserId, width }: ThreadPanelProps) {
  const activeThreadId = useThreadsStore((s) => s.activeThreadId);
  const threadOrderMap = useThreadsStore((s) => s.threadOrder);
  const threadPosts = useThreadsStore((s) => s.threadPosts);
  const threadLoading = useThreadsStore((s) => s.threadLoading);

  const order = useMemo(
    () => (activeThreadId ? threadOrderMap[activeThreadId] ?? EMPTY_ORDER : EMPTY_ORDER),
    [threadOrderMap, activeThreadId],
  );

  const userThreads = useThreadsStore((s) => s.userThreads);
  const isFollowing = useMemo(
    () => userThreads.find((t) => t.id === activeThreadId)?.is_following ?? false,
    [userThreads, activeThreadId],
  );
  const [followLoading, setFollowLoading] = useState(false);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);

  // Reset edit state when thread changes
  useEffect(() => {
    setEditingPostId(null);
  }, [activeThreadId]);

  // Load thread when activeThreadId changes and mark as read
  useEffect(() => {
    if (!activeThreadId) return;
    let cancelled = false;

    const { setThreadLoading, setThreadData, markThreadRead } = useThreadsStore.getState();
    // Clear cached order for this thread so stale posts don't flash
    setThreadData(activeThreadId, [], {});
    setThreadLoading(true);

    invoke<PostsResponse>("get_post_thread", {
      serverId,
      postId: activeThreadId,
    })
      .then(async (res) => {
        if (cancelled) return;
        // Sort posts by create_at ascending (oldest first)
        const displayOrder = Object.values(res.posts)
          .sort((a, b) => a.create_at - b.create_at)
          .map((p) => p.id);

        // Load reactions for all posts in the thread
        const postsWithReactions = { ...res.posts };
        await Promise.all(
          Object.keys(res.posts).map(async (postId) => {
            try {
              const reactions = await invoke<Array<{ user_id: string; post_id: string; emoji_name: string; create_at: number }>>(
                "get_reactions", { serverId, postId }
              );
              postsWithReactions[postId] = {
                ...postsWithReactions[postId],
                metadata: { ...postsWithReactions[postId].metadata, reactions },
              };
            } catch {
              // ignore reaction load errors
            }
          })
        );

        setThreadData(activeThreadId, displayOrder, postsWithReactions);

        // Prefetch user info for all post authors not yet in cache
        const uniqueUserIds = [...new Set(Object.values(res.posts).map((p) => p.user_id))];
        const cachedUsers = useUiStore.getState().users;
        const missingUserIds = uniqueUserIds.filter((id) => !cachedUsers[id]);
        if (missingUserIds.length > 0) {
          invoke("get_users_by_ids", { serverId, userIds: missingUserIds })
            .then((result) => {
              useUiStore.getState().setUsers(
                result as Array<{ id: string; username: string; first_name: string; last_name: string; nickname: string; email: string }>,
              );
            })
            .catch(() => {/* non-critical */});
        }

        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView();
        });

        // Mark thread as read on the client immediately
        markThreadRead(activeThreadId);

        // Mark thread as read on the server + fetch is_following
        const teamId = useUiStore.getState().activeTeamId;
        if (teamId) {
          invoke("mark_thread_as_read", {
            serverId,
            teamId,
            threadId: activeThreadId,
            timestamp: Date.now(),
          }).catch((e: unknown) => console.error("Failed to mark thread as read:", e));

          invoke<{ id: string; is_following: boolean }>("get_thread", {
            serverId,
            teamId,
            threadId: activeThreadId,
          })
            .then((t) => {
              if (!cancelled) {
                useThreadsStore.getState().updateThreadFollowing(t.id, t.is_following);
              }
            })
            .catch(() => {/* non-critical */});
        }
      })
      .catch((e) => console.error("Failed to load thread:", e))
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, serverId]);

  // Auto-scroll on new replies
  useEffect(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [order.length]);

  // Scroll to and highlight a specific post inside the thread (from Reactions navigation)
  const scrollToThreadPostId = useThreadsStore((s) => s.scrollToThreadPostId);
  useEffect(() => {
    if (!scrollToThreadPostId) return;
    const timer = setTimeout(() => {
      const container = panelBodyRef.current;
      const el = container?.querySelector<HTMLElement>(`[data-post-id="${scrollToThreadPostId}"]`);
      if (container && el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("highlight-post");
        setTimeout(() => el.classList.remove("highlight-post"), 2000);
      }
      useThreadsStore.getState().setScrollToThreadPostId(null);
    }, 350);
    return () => clearTimeout(timer);
  }, [scrollToThreadPostId, order]);

  const rootPost = activeThreadId
    ? threadPosts[activeThreadId] || useMessagesStore.getState().posts[activeThreadId]
    : undefined;

  const channelName = useMemo(() => {
    if (!rootPost) return null;
    const store = useUiStore.getState();
    const ch = store.channels.find((c) => c.id === rootPost.channel_id);
    if (!ch) return null;
    if (ch.channel_type === "D") {
      const parts = ch.name.split("__");
      for (const part of parts) {
        if (part === currentUserId) continue;
        const user = store.users[part];
        if (user) return user.nickname || `${user.first_name} ${user.last_name}`.trim() || user.username;
      }
      // fallback: any part
      for (const part of parts) {
        const user = store.users[part];
        if (user) return user.nickname || `${user.first_name} ${user.last_name}`.trim() || user.username;
      }
      return ch.display_name || "Direct Message";
    }
    return ch.display_name || ch.name;
  }, [rootPost, currentUserId]);

  const isDmChannel = useMemo(() => {
    if (!rootPost) return false;
    const ch = useUiStore.getState().channels.find((c) => c.id === rootPost.channel_id);
    return ch?.channel_type === "D" || ch?.channel_type === "G";
  }, [rootPost]);

  if (!activeThreadId) return null;

  function handleEditPost(postId: string) {
    const post = threadPosts[postId] || useMessagesStore.getState().posts[postId];
    if (!post) return;
    setEditingPostId(postId);
  }

  function cancelEdit() {
    setEditingPostId(null);
  }

  async function handleToggleFollow() {
    if (!activeThreadId || followLoading) return;
    const teamId = useUiStore.getState().activeTeamId;
    if (!teamId) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await invoke("unfollow_thread", { serverId, teamId, threadId: activeThreadId });
      } else {
        await invoke("follow_thread", { serverId, teamId, threadId: activeThreadId });
      }
      useThreadsStore.getState().updateThreadFollowing(activeThreadId, !isFollowing);
    } catch (e) {
      console.error("Failed to toggle thread follow:", e);
    } finally {
      setFollowLoading(false);
    }
  }

  function handleClose() {
    useThreadsStore.getState().clearThread();
  }

  function handleGoToChannel() {
    if (!rootPost) return;
    const uiStore = useUiStore.getState();
    const ch = uiStore.channels.find((c) => c.id === rootPost.channel_id);
    if (ch) {
      primeLastViewedSnapshot(ch.id, ch.last_viewed_at);
    }
    uiStore.setActiveChannelId(rootPost.channel_id);
    uiStore.setMainSubView("channels");
    const tabStore = useTabsStore.getState();
    tabStore.navigateDefaultTab(rootPost.channel_id);
  }

  // Count replies (all posts except root)
  const replyCount = order.filter((id) => id !== activeThreadId).length;

  return (
    <div
      className="thread-panel"
      style={width ? { width, minWidth: width } : undefined}
    >
      <div className="thread-panel-header">
        <div className="thread-panel-title">
          <span className="thread-title-text">Thread</span>
          <span className="thread-reply-count">{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>
        </div>
        {channelName && (
          <button
            className="thread-channel-btn"
            onClick={handleGoToChannel}
            title={`Go to ${channelName}`}
          >
            {isDmChannel ? channelName : `# ${channelName}`}
          </button>
        )}
        <button
          className={`thread-follow-btn ${isFollowing ? "following" : ""}`}
          onClick={handleToggleFollow}
          disabled={followLoading}
          title={isFollowing ? "Unfollow thread" : "Follow thread"}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>
        <button className="thread-close-btn" onClick={handleClose} title="Close">
          ✕
        </button>
      </div>

      <div className="thread-panel-body" ref={panelBodyRef}>
        {threadLoading && order.length === 0 ? (
          <div className="thread-loading">
            <div className="spinner small" />
          </div>
        ) : (
          <>
            {/* Root post */}
            {rootPost && (
              <div className="thread-root-post">
                <MessageItem
                  post={rootPost}
                  showAvatar={true}
                  onEdit={handleEditPost}
                  onDelete={() => {}}
                  currentUserId={currentUserId}
                  serverId={serverId}
                  hideThreadIndicator={true}
                />
              </div>
            )}

            {replyCount > 0 && (
              <div className="thread-replies-divider">
                <span>{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>
              </div>
            )}

            {/* Replies */}
            {order
              .filter((id) => id !== activeThreadId)
              .map((postId) => {
                const post = threadPosts[postId];
                if (!post || post.delete_at > 0) return null;
                return (
                  <MessageItem
                    key={post.id}
                    post={post}
                    showAvatar={true}
                    onEdit={handleEditPost}
                    onDelete={() => {}}
                    currentUserId={currentUserId}
                    serverId={serverId}
                    hideThreadIndicator={true}
                  />
                );
              })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <MessageComposer
        channelId={rootPost?.channel_id ?? ""}
        serverId={serverId}
        rootId={activeThreadId}
        externalEditingPostId={editingPostId}
        onCancelExternalEdit={cancelEdit}
        onEditRequest={(postId) => handleEditPost(postId)}
        onReplySent={() => {
          requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          });
        }}
        placeholder="Reply..."
      />
    </div>
  );
}
