import { useEffect, useRef, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useThreadsStore } from "@/stores/threadsStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";
import { MessageItem } from "./MessageItem";
import { EmojiPicker, EMOJI_MAP } from "./EmojiPicker";

interface PostsResponse {
  order: string[];
  posts: Record<string, PostData>;
}

interface ThreadPanelProps {
  serverId: string;
  currentUserId: string | null;
}

const EMPTY_ORDER: string[] = [];

export function ThreadPanel({ serverId, currentUserId }: ThreadPanelProps) {
  const activeThreadId = useThreadsStore((s) => s.activeThreadId);
  const threadOrderMap = useThreadsStore((s) => s.threadOrder);
  const threadPosts = useThreadsStore((s) => s.threadPosts);
  const threadLoading = useThreadsStore((s) => s.threadLoading);

  const order = useMemo(
    () => (activeThreadId ? threadOrderMap[activeThreadId] ?? EMPTY_ORDER : EMPTY_ORDER),
    [threadOrderMap, activeThreadId],
  );

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView();
        });

        // Mark thread as read on the client immediately
        markThreadRead(activeThreadId);

        // Mark thread as read on the server
        const teamId = useUiStore.getState().activeTeamId;
        if (teamId) {
          invoke("mark_thread_as_read", {
            serverId,
            teamId,
            threadId: activeThreadId,
            timestamp: Date.now(),
          }).catch((e: unknown) => console.error("Failed to mark thread as read:", e));
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

  if (!activeThreadId) return null;

  const rootPost = threadPosts[activeThreadId] || useMessagesStore.getState().posts[activeThreadId];

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || !activeThreadId) return;

    setSending(true);
    try {
      const rootPost = threadPosts[activeThreadId!] || useMessagesStore.getState().posts[activeThreadId!];
      const newPost = await invoke<PostData>("send_post", {
        serverId,
        channelId: rootPost?.channel_id ?? "",
        message: trimmed,
        rootId: activeThreadId,
      });
      useThreadsStore.getState().addThreadReply(newPost);
      // Also add to main messages store
      useMessagesStore.getState().addPost(newPost);
      setText("");
    } catch (e) {
      console.error("Failed to send reply:", e);
    } finally {
      setSending(false);
    }
  }

  function insertEmojiFromPicker(emojiName: string) {
    const ta = textareaRef.current;
    const unicode = EMOJI_MAP[emojiName] || `:${emojiName}: `;
    const cursor = ta ? ta.selectionStart : text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const newText = before + unicode + after;
    handleTextChange(newText);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      if (ta) {
        const newCursor = cursor + unicode.length;
        ta.setSelectionRange(newCursor, newCursor);
        ta.focus();
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      useThreadsStore.getState().clearThread();
    }
  }

  function handleClose() {
    useThreadsStore.getState().clearThread();
  }

  // Adjust textarea height
  function handleTextChange(value: string) {
    setText(value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 126) + "px";
    }
  }

  // Count replies (all posts except root)
  const replyCount = order.filter((id) => id !== activeThreadId).length;

  return (
    <div className="thread-panel">
      <div className="thread-panel-header">
        <div className="thread-panel-title">
          <span className="thread-title-text">Thread</span>
          <span className="thread-reply-count">{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>
        </div>
        <button className="thread-close-btn" onClick={handleClose} title="Close">
          ✕
        </button>
      </div>

      <div className="thread-panel-body">
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
                  onEdit={() => {}}
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
                    onEdit={() => {}}
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

      <div className="thread-panel-composer">
        <div className="composer-input-row">
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            rows={1}
            disabled={sending}
          />
          <div className="composer-emoji-wrap">
            <button
              ref={emojiTriggerRef}
              className="composer-emoji-btn"
              onClick={() => setShowEmojiPicker((v) => !v)}
              title="Emoji"
              disabled={sending}
            >
              😊
            </button>
            {showEmojiPicker && (
              <div className="composer-emoji-popup">
                <EmojiPicker
                  onSelect={insertEmojiFromPicker}
                  onClose={() => setShowEmojiPicker(false)}
                  triggerRef={emojiTriggerRef}
                />
              </div>
            )}
          </div>
          <button
            className="composer-send-btn"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            title="Send reply"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
