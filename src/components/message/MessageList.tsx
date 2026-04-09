import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";
import { useThreadsStore } from "@/stores/threadsStore";
import {
  primeLastViewedSnapshot,
  getLastViewedSnapshot,
} from "@/stores/lastViewedSnapshot";
import { MessageItem } from "./MessageItem";

interface PostsResponse {
  order: string[];
  posts: Record<string, PostData>;
}

interface UnreadPostsResponse {
  order: string[];
  posts: Record<string, PostData>;
  prev_post_id: string;
  next_post_id: string;
}

interface MessageListProps {
  channelId: string;
  serverId: string;
  currentUserId: string | null;
  onEditPost: (postId: string) => void;
}

const POSTS_PER_PAGE = 30;
const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const EMPTY_ORDER: string[] = [];

function fetchThreadParticipants(rawRootIds: string[], serverId: string) {
  // Defer to let store settle after setChannelPosts/prependOlderPosts
  setTimeout(() => {
    const { threadParticipants } = useThreadsStore.getState();
    const allPosts = useMessagesStore.getState().posts;
    // Also include any posts in store with reply_count computed from replies
    const ids = new Set(rawRootIds);
    for (const p of Object.values(allPosts)) {
      if (!p.root_id && (p.reply_count ?? 0) > 0) ids.add(p.id);
    }
    for (const rootId of ids) {
      if (threadParticipants[rootId]) continue;
      invoke<PostsResponse>("get_post_thread", { serverId, postId: rootId })
        .then((threadRes) => {
          const seen = new Set<string>();
          const result: string[] = [];
          const sorted = Object.values(threadRes.posts).sort((a, b) => a.create_at - b.create_at);
          for (const p of sorted) {
            if (!seen.has(p.user_id)) {
              seen.add(p.user_id);
              result.push(p.user_id);
              if (result.length === 3) break;
            }
          }
          useThreadsStore.getState().setThreadParticipants(rootId, result);
        })
        .catch(() => {});
    }
  }, 0);
}

function getMessagesActions() {
  const s = useMessagesStore.getState();
  return {
    setChannelPosts: s.setChannelPosts,
    prependOlderPosts: s.prependOlderPosts,
    setLoading: s.setLoading,
    removePost: s.removePost,
  };
}

export function MessageList({
  channelId,
  serverId,
  currentUserId,
  onEditPost,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const shouldPinToBottom = useRef(false);
  const [unreadInfo, setUnreadInfo] = useState<{ firstUnreadId: string; count: number } | null>(null);

  const orderByChannel = useMessagesStore((s) => s.orderByChannel);
  const order = useMemo(() => orderByChannel[channelId] ?? EMPTY_ORDER, [orderByChannel, channelId]);
  const posts = useMessagesStore((s) => s.posts);
  const loading = useMessagesStore((s) => s.loading);

  // Load initial posts
  useEffect(() => {
    let cancelled = false;
    const { setLoading, setChannelPosts } = getMessagesActions();
    setLoading(true);
    setHasMore(true);
    setLoadError(null);

    // Reset unread banner for this channel open.
    setUnreadInfo(null);

    // Snapshot last_viewed_at from the client store (populated once at app
    // startup by loadChannels and never overwritten by view_channel). Mirrors
    // Mattermost webapp's frozen `views.channel.lastChannelViewTime` map.
    const channelInfo = useUiStore.getState().channels.find((c) => c.id === channelId);
    if (channelInfo) {
      primeLastViewedSnapshot(channelId, channelInfo.last_viewed_at);
    }
    const lastViewedAt = getLastViewedSnapshot(channelId);

    // Use the unread endpoint — it returns a chunk centered on the unread
    // marker, so the first unread message is guaranteed to be in the chunk
    // if one exists.
    const loadPromise = invoke<UnreadPostsResponse>("get_posts_around_last_unread", {
      serverId,
      channelId,
      limitBefore: 30,
      limitAfter: 60,
    }).then((res) => {
      if (cancelled) return;
      setChannelPosts(channelId, res.order, res.posts);
      // prev_post_id === '' means we're at the oldest post in the channel.
      if (res.prev_post_id === "") setHasMore(false);

      // Compute unread info: first unread post + count of unread posts.
      // Walk chronologically (oldest → newest).
      let firstUnreadId: string | null = null;
      let unreadCount = 0;
      if (lastViewedAt > 0) {
        const displayOrder = [...res.order].reverse();
        for (const pid of displayOrder) {
          const p = res.posts[pid];
          if (!p || p.delete_at > 0 || p.root_id) continue;
          // Skip system messages (joined/left/header changes/etc).
          if (p.post_type && p.post_type.startsWith("system_")) continue;
          if (p.create_at > lastViewedAt) {
            if (!firstUnreadId) firstUnreadId = pid;
            unreadCount++;
          }
        }
      }

      if (firstUnreadId && unreadCount > 0) {
        setUnreadInfo({ firstUnreadId, count: unreadCount });
      }

      // Background: load thread participants for root posts with replies.
      if (!cancelled) {
        fetchThreadParticipants(
          Object.values(res.posts).filter((p) => !p.root_id && (p.reply_count ?? 0) > 0).map((p) => p.id),
          serverId,
        );
      }

      // Always scroll to the bottom (latest message) on channel open.
      requestAnimationFrame(() => {
        if (cancelled) return;
        shouldPinToBottom.current = true;
        bottomRef.current?.scrollIntoView();
        setTimeout(() => { shouldPinToBottom.current = false; }, 2000);
      });

      // Mark channel as viewed on server AFTER posts are loaded. The
      // last_viewed_at snapshot is frozen, so this won't affect the
      // unread banner.
      invoke("view_channel", { serverId, channelId }).catch(console.error);
    });

    loadPromise
      .catch((e) => {
        if (cancelled) return;
        console.error("Failed to load posts:", e);
        const msg = String(e).toLowerCase();
        if (msg.includes("timed out") || msg.includes("network") || msg.includes("connect")) {
          setLoadError("Не удалось загрузить сообщения — нет соединения с сервером");
        } else {
          setLoadError("Не удалось загрузить сообщения");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [channelId, serverId]);

  // Auto-scroll when new messages arrive and we're near bottom
  useEffect(() => {
    if (isNearBottom) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [order.length, isNearBottom]);

  // Keep pinned to bottom while images/content loads after initial channel open
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (shouldPinToBottom.current) {
        bottomRef.current?.scrollIntoView();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load user info for unknown users in posts
  useEffect(() => {
    const users = useUiStore.getState().users;
    const unknownIds = new Set<string>();
    for (const id of order) {
      const post = posts[id];
      if (post && !users[post.user_id]) {
        unknownIds.add(post.user_id);
      }
    }
    if (unknownIds.size > 0) {
      invoke("get_users_by_ids", {
        serverId,
        userIds: [...unknownIds],
      })
        .then((result) => {
          useUiStore.getState().setUsers(
            result as Array<{
              id: string;
              username: string;
              first_name: string;
              last_name: string;
              nickname: string;
              email: string;
            }>,
          );
        })
        .catch(console.error);
    }
  }, [order, serverId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Check if near bottom
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distFromBottom < 80);

    // Load older posts when scrolled to top
    if (el.scrollTop < 50 && hasMore && !loadingOlder) {
      loadOlderPosts();
    }
  }, [hasMore, loadingOlder, channelId, serverId, order]);

  async function loadOlderPosts() {
    if (!hasMore || loadingOlder) return;
    setLoadingOlder(true);

    const page = Math.ceil(order.length / POSTS_PER_PAGE);
    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;

    try {
      const res = await invoke<PostsResponse>("get_posts", {
        serverId,
        channelId,
        page,
        perPage: POSTS_PER_PAGE,
      });

      getMessagesActions().prependOlderPosts(channelId, res.order, res.posts);
      if (res.order.length < POSTS_PER_PAGE) setHasMore(false);

      fetchThreadParticipants(
        Object.values(res.posts).filter((p) => !p.root_id && (p.reply_count ?? 0) > 0).map((p) => p.id),
        serverId,
      );

      // Maintain scroll position after prepending
      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = el.scrollHeight - prevScrollHeight;
        }
      });
    } catch (e) {
      console.error("Failed to load older posts:", e);
    } finally {
      setLoadingOlder(false);
    }
  }

  const handleDelete = useCallback(async (postId: string) => {
    try {
      await invoke("delete_post", { serverId, postId });
      getMessagesActions().removePost(postId);
    } catch (e) {
      console.error("Failed to delete post:", e);
    }
  }, [serverId]);

  const handleImageLoad = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If we're within 300px of bottom, snap back down after image expands layout
    if (distFromBottom < 300) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    setIsNearBottom(true);
  }

  function jumpToFirstUnread() {
    if (!unreadInfo) return;
    const container = scrollRef.current;
    const el = container?.querySelector<HTMLElement>(
      `[data-post-id="${unreadInfo.firstUnreadId}"]`,
    );
    if (container && el) {
      // Disable auto-pin and mark as not-near-bottom BEFORE scrolling so
      // the order.length / ResizeObserver effects don't yank us back down.
      shouldPinToBottom.current = false;
      setIsNearBottom(false);
      // Use non-smooth scroll + explicit scrollTop to avoid intermediate
      // scroll events re-triggering the near-bottom auto-scroll.
      const targetTop = el.offsetTop - container.offsetTop;
      container.scrollTop = targetTop;
    }
    setUnreadInfo(null);
  }

  // Build post list (order is newest-first from API, reverse for display)
  // Memoize to avoid rebuilding on unrelated state changes
  const elements = useMemo(() => {
    const displayOrder = [...order].reverse();
    const result: React.ReactNode[] = [];
    let lastDate = "";
    let lastUserId = "";
    let lastTime = 0;

    for (const postId of displayOrder) {
      const post = posts[postId];
      if (!post || post.delete_at > 0) continue;
      if (post.root_id) continue;

      const date = new Date(post.create_at);
      const dateKey = date.toLocaleDateString([], {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      if (dateKey !== lastDate) {
        result.push(
          <div key={`date-${dateKey}`} className="date-separator">
            <span>{dateKey}</span>
          </div>,
        );
        lastDate = dateKey;
        lastUserId = "";
        lastTime = 0;
      }

      const sameUser = post.user_id === lastUserId;
      const withinThreshold = post.create_at - lastTime < GROUP_THRESHOLD_MS;
      const showAvatar = !sameUser || !withinThreshold;

      result.push(
        <MessageItem
          key={post.id}
          post={post}
          showAvatar={showAvatar}
          onEdit={onEditPost}
          onDelete={handleDelete}
          currentUserId={currentUserId}
          serverId={serverId}
          onImageLoad={handleImageLoad}
        />,
      );

      lastUserId = post.user_id;
      lastTime = post.create_at;
    }
    return result;
  }, [order, posts, onEditPost, currentUserId, serverId]);

  if (loading && order.length === 0) {
    return (
      <div className="message-list-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (loadError && order.length === 0) {
    return (
      <div className="message-list-loading" style={{ flexDirection: "column", gap: 12 }}>
        <span style={{ color: "var(--error)", fontSize: 14 }}>{loadError}</span>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setLoadError(null);
            const { setLoading, setChannelPosts } = getMessagesActions();
            setLoading(true);
            invoke<PostsResponse>("get_posts", { serverId, channelId, page: 0, perPage: POSTS_PER_PAGE })
              .then((res) => { setChannelPosts(channelId, res.order, res.posts); })
              .catch(() => setLoadError("Не удалось загрузить сообщения"))
              .finally(() => setLoading(false));
          }}
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="message-list-container">
      {unreadInfo && (
        <button className="unread-messages-top" onClick={jumpToFirstUnread}>
          {unreadInfo.count} new {unreadInfo.count === 1 ? "message" : "messages"} ↑
        </button>
      )}
      <div className="message-list" ref={scrollRef} onScroll={handleScroll}>
        {loadingOlder && (
          <div className="loading-older">
            <div className="spinner small" />
          </div>
        )}
        {!hasMore && order.length > 0 && (
          <div className="channel-start">Beginning of conversation</div>
        )}
        {elements}
        <div ref={bottomRef} />
      </div>
      {!isNearBottom && (
        <button className="scroll-to-bottom" onClick={scrollToBottom}>
          ↓ New messages
        </button>
      )}
    </div>
  );
}
