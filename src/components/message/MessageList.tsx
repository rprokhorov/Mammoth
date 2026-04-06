import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";
import { MessageItem } from "./MessageItem";

interface PostsResponse {
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

    invoke<PostsResponse>("get_posts", {
      serverId,
      channelId,
      page: 0,
      perPage: POSTS_PER_PAGE,
    })
      .then((res) => {
        if (cancelled) return;
        setChannelPosts(channelId, res.order, res.posts);
        if (res.order.length < POSTS_PER_PAGE) setHasMore(false);
        shouldPinToBottom.current = true;
        bottomRef.current?.scrollIntoView();
        setTimeout(() => { shouldPinToBottom.current = false; }, 2000);
      })
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
