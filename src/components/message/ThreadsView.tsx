import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useThreadsStore, type UserThread } from "@/stores/threadsStore";
import { useUiStore } from "@/stores/uiStore";

interface UserThreadListResponse {
  threads: UserThread[];
  total: number;
  total_unread_threads: number;
  total_unread_mentions: number;
}

interface ThreadsViewProps {
  serverId: string;
  teamId: string;
}

export function ThreadsView({ serverId, teamId }: ThreadsViewProps) {
  const userThreads = useThreadsStore((s) => s.userThreads);
  const userThreadsUnread = useThreadsStore((s) => s.userThreadsUnread);
  const activeThreadId = useThreadsStore((s) => s.activeThreadId);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  // Load threads on mount and when thread panel closes (to refresh read state)
  useEffect(() => {
    loadThreads();
  }, [serverId, teamId, activeThreadId]);

  async function loadThreads() {
    setLoading(true);
    try {
      const res = await invoke<UserThreadListResponse>("get_user_threads", {
        serverId,
        teamId,
        page: 0,
        perPage: 50,
      });
      useThreadsStore.getState().setUserThreads(
        res.threads ?? [],
        res.total,
        res.total_unread_threads,
      );
    } catch (e) {
      console.error("Failed to load threads:", e);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenThread(threadId: string) {
    useThreadsStore.getState().setActiveThread(threadId);
  }

  const displayed = filter === "unread"
    ? userThreads.filter((t) => t.unread_replies > 0)
    : userThreads;

  const users = useUiStore.getState().users;

  return (
    <div className="threads-view">
      <div className="threads-view-header">
        <h3>Threads</h3>
        {userThreadsUnread > 0 && (
          <span className="threads-unread-badge">{userThreadsUnread}</span>
        )}
      </div>

      <div className="threads-filter">
        <button
          className={`threads-filter-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={`threads-filter-btn ${filter === "unread" ? "active" : ""}`}
          onClick={() => setFilter("unread")}
        >
          Unread
        </button>
      </div>

      <div className="threads-list">
        {loading && displayed.length === 0 ? (
          <div className="threads-loading">
            <div className="spinner small" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="threads-empty">
            <p className="muted">
              {filter === "unread" ? "No unread threads" : "No threads yet"}
            </p>
          </div>
        ) : (
          displayed.map((thread) => {
            const post = thread.post;
            if (!post) return null;

            const user = users[post.user_id];
            const authorName = user
              ? user.nickname || `${user.first_name} ${user.last_name}`.trim() || user.username
              : post.user_id.slice(0, 8);

            const isUnread = thread.unread_replies > 0;
            const timeStr = new Date(thread.last_reply_at).toLocaleDateString([], {
              month: "short",
              day: "numeric",
            });

            return (
              <button
                key={thread.id}
                className={`thread-list-item ${isUnread ? "unread" : ""}`}
                onClick={() => handleOpenThread(thread.id)}
              >
                <div className="thread-list-avatar">
                  {authorName.charAt(0).toUpperCase()}
                </div>
                <div className="thread-list-content">
                  <div className="thread-list-header">
                    <span className="thread-list-author">{authorName}</span>
                    <span className="thread-list-time">{timeStr}</span>
                  </div>
                  <div className="thread-list-preview">
                    {post.message.slice(0, 100)}
                    {post.message.length > 100 ? "..." : ""}
                  </div>
                  <div className="thread-list-meta">
                    <span>{thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}</span>
                    {isUnread && (
                      <span className="thread-list-unread">
                        {thread.unread_replies} new
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
