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

interface PostsDiskCache {
  saved_at: number;
  order: string[];
  posts: Record<string, PostData>;
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

/** Fetch and cache user info for unknown user IDs (fire-and-forget). */
function prefetchUsers(userIds: string[], serverId: string) {
  if (userIds.length === 0) return;
  const users = useUiStore.getState().users;
  const unknown = userIds.filter((id) => !users[id]);
  if (unknown.length === 0) return;
  invoke("get_users_by_ids", { serverId, userIds: unknown })
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
  const userScrolled = useRef(false);
  const [unreadInfo, setUnreadInfo] = useState<{ firstUnreadId: string; count: number } | null>(null);

  const orderByChannel = useMessagesStore((s) => s.orderByChannel);
  const order = useMemo(() => orderByChannel[channelId] ?? EMPTY_ORDER, [orderByChannel, channelId]);
  const posts = useMessagesStore((s) => s.posts);
  const loading = useMessagesStore((s) => s.loading);

  // Load initial posts — stale-while-revalidate strategy:
  // 1. If memory cache exists → show immediately, fetch silently in background
  // 2. If no memory cache → try disk cache, show it, then fetch silently
  // 3. If no disk cache → show spinner, fetch, then display
  useEffect(() => {
    let cancelled = false;
    const { setLoading, setChannelPosts } = getMessagesActions();

    const hasCachedInMemory = (useMessagesStore.getState().orderByChannel[channelId]?.length ?? 0) > 0;

    // Show spinner only if truly no data available
    if (!hasCachedInMemory) setLoading(true);

    setHasMore(true);
    setLoadError(null);
    setUnreadInfo(null);
    userScrolled.current = false;

    const channelInfo = useUiStore.getState().channels.find((c) => c.id === channelId);
    if (channelInfo) {
      primeLastViewedSnapshot(channelId, channelInfo.last_viewed_at);
    }
    const lastViewedAt = getLastViewedSnapshot(channelId);

    const hasUnread = channelInfo
      ? channelInfo.last_viewed_at > 0 && channelInfo.last_post_at > channelInfo.last_viewed_at
      : false;

    const fetchFromNetwork = (): Promise<UnreadPostsResponse> => {
      if (hasUnread) {
        return invoke<UnreadPostsResponse>("get_posts_around_last_unread", {
          serverId,
          channelId,
          limitBefore: 30,
          limitAfter: 60,
        });
      }
      return invoke<PostsResponse>("get_posts", {
        serverId,
        channelId,
        page: 0,
        perPage: 60,
      }).then((res) => ({
        order: res.order,
        posts: res.posts,
        prev_post_id: res.order.length < 60 ? "" : "placeholder",
        next_post_id: "",
      }));
    };

    const applyPosts = (res: UnreadPostsResponse, scrollToBottom: boolean) => {
      if (!res) return;
      setChannelPosts(channelId, res.order, res.posts);
      if (cancelled) return;

      if (res.prev_post_id === "") setHasMore(false);

      // Compute unread banner
      let firstUnreadId: string | null = null;
      let unreadCount = 0;
      if (lastViewedAt > 0) {
        const displayOrder = [...res.order].reverse();
        for (const pid of displayOrder) {
          const p = res.posts[pid];
          if (!p || p.delete_at > 0 || p.root_id) continue;
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

      // C: Prefetch users in parallel (fire-and-forget)
      prefetchUsers(
        Object.values(res.posts).map((p) => p.user_id),
        serverId,
      );

      // Background: load thread participants
      fetchThreadParticipants(
        Object.values(res.posts).filter((p) => !p.root_id && (p.reply_count ?? 0) > 0).map((p) => p.id),
        serverId,
      );

      if (scrollToBottom) {
        requestAnimationFrame(() => {
          if (cancelled) return;
          shouldPinToBottom.current = true;
          userScrolled.current = false;
          bottomRef.current?.scrollIntoView();
        });
      }
    };

    const runLoad = async () => {
      // Step 1: try disk cache if no memory cache
      if (!hasCachedInMemory) {
        try {
          const diskCache = await invoke<PostsDiskCache | null>("load_posts_cache", {
            serverId,
            channelId,
          });
          if (diskCache && diskCache.order.length > 0 && !cancelled) {
            // Show disk cache immediately — this removes the spinner
            setChannelPosts(channelId, diskCache.order, diskCache.posts);
            setLoading(false);
            // Prefetch users from disk cache right away
            prefetchUsers(
              Object.values(diskCache.posts).map((p) => p.user_id),
              serverId,
            );
            // Scroll to bottom with disk-cached data
            requestAnimationFrame(() => {
              if (cancelled) return;
              shouldPinToBottom.current = true;
              userScrolled.current = false;
              bottomRef.current?.scrollIntoView();
            });
          }
        } catch {
          // disk cache miss — no problem, network fetch follows
        }
      }

      // Step 2: always fetch from network (silently if we already have data)
      const withRetry = () =>
        fetchFromNetwork().catch((e) => {
          if (cancelled) return Promise.reject(e);
          const msg = String(e).toLowerCase();
          if (msg.includes("connect") || msg.includes("network") || msg.includes("timed out") || msg.includes("reset") || msg.includes("eof")) {
            return new Promise<UnreadPostsResponse>((resolve, reject) =>
              setTimeout(() => { if (!cancelled) fetchFromNetwork().then(resolve, reject); else reject(e); }, 1500),
            );
          }
          return Promise.reject(e);
        });

      try {
        const res = await withRetry();
        if (cancelled) return;
        const hasDataAlready = (useMessagesStore.getState().orderByChannel[channelId]?.length ?? 0) > 0;
        applyPosts(res, !hasDataAlready);
        // If we had cached data and just silently updated, re-pin to bottom only if user hasn't scrolled
        if (hasDataAlready && !userScrolled.current) {
          requestAnimationFrame(() => {
            if (!cancelled) {
              shouldPinToBottom.current = true;
              bottomRef.current?.scrollIntoView();
            }
          });
        }
        // D: Save fresh posts to disk cache (fire-and-forget)
        invoke("save_posts_cache", {
          serverId,
          channelId,
          order: res.order,
          posts: res.posts,
        }).catch(() => {});

        // Mark channel as viewed on server AFTER posts loaded
        invoke("view_channel", { serverId, channelId }).catch(console.error);
      } catch (e) {
        if (cancelled) return;
        const hasFallbackData = (useMessagesStore.getState().orderByChannel[channelId]?.length ?? 0) > 0;
        if (!hasFallbackData) {
          console.error("Failed to load posts:", e);
          const msg = String(e).toLowerCase();
          if (msg.includes("timed out") || msg.includes("network") || msg.includes("connect")) {
            setLoadError("Не удалось загрузить сообщения — нет соединения с сервером");
          } else {
            setLoadError("Не удалось загрузить сообщения");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    runLoad();

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

  // C: Load user info for any unknown users that appear in the post list
  // (secondary pass — covers users not in posts.user_id like reaction authors etc.)
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
      prefetchUsers([...unknownIds], serverId);
    }
  }, [order, serverId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < 80;
    setIsNearBottom(nearBottom);

    // If user scrolled up, stop pinning to bottom
    if (!nearBottom && !userScrolled.current) {
      userScrolled.current = true;
      shouldPinToBottom.current = false;
    }
    // If user scrolled back to bottom, re-enable pin
    if (nearBottom) {
      userScrolled.current = false;
      shouldPinToBottom.current = true;
    }

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

      // C: prefetch users for older posts
      prefetchUsers(Object.values(res.posts).map((p) => p.user_id), serverId);

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
    // If we're pinned to bottom (user hasn't manually scrolled up), snap back down
    if (shouldPinToBottom.current) {
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

  // Scroll to a specific post when scrollToPostId is set
  const scrollToPostId = useMessagesStore((s) => s.scrollToPostId);
  useEffect(() => {
    if (!scrollToPostId) return;
    // Wait a tick for the DOM to be ready after channel switch
    const timer = setTimeout(() => {
      const container = scrollRef.current;
      const el = container?.querySelector<HTMLElement>(
        `[data-post-id="${scrollToPostId}"]`,
      );
      if (container && el) {
        shouldPinToBottom.current = false;
        setIsNearBottom(false);
        const targetTop = el.offsetTop - container.offsetTop;
        container.scrollTop = targetTop;
        // Briefly highlight the post
        el.classList.add("highlight-post");
        setTimeout(() => el.classList.remove("highlight-post"), 2000);
      }
      useMessagesStore.getState().setScrollToPostId(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [scrollToPostId, order]);

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
