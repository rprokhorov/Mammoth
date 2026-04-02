import { useState, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { PresenceDot } from "./PresenceDot";
import { FileAttachment } from "./FileAttachment";
import { UserPopover } from "@/components/user/UserPopover";
import { ReactionsBar } from "./ReactionsBar";
import { EmojiPicker } from "./EmojiPicker";

interface MessageItemProps {
  post: PostData;
  showAvatar: boolean;
  onEdit: (postId: string) => void;
  onDelete: (postId: string) => void;
  currentUserId: string | null;
  serverId?: string;
  hideThreadIndicator?: boolean;
}

export const MessageItem = memo(function MessageItem({
  post,
  showAvatar,
  onEdit,
  onDelete,
  currentUserId,
  serverId,
  hideThreadIndicator,
}: MessageItemProps) {
  const users = useUiStore((s) => s.users);
  const user = users[post.user_id];
  const [showPopover, setShowPopover] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const displayName = user
    ? user.nickname ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.username
    : post.user_id.slice(0, 8);

  const username = user?.username ?? post.user_id.slice(0, 8);
  const initials = displayName.charAt(0).toUpperCase();
  const isOwn = post.user_id === currentUserId;
  const isEdited = post.edit_at > 0;
  const isSystem = post.post_type !== "" && post.post_type !== undefined;
  const hasReplies = (post.reply_count ?? 0) > 0 && !post.root_id;
  const isThreadRoot = !post.root_id && hasReplies;
  const reactions = post.metadata?.reactions || [];

  if (isSystem) {
    return (
      <div className="message-item system-message">
        <div className="message-content-area">
          <span className="system-text">{post.message}</span>
        </div>
      </div>
    );
  }

  const time = new Date(post.create_at);
  const timeStr = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  function handleOpenThread() {
    const threadId = post.root_id || post.id;
    useThreadsStore.getState().setActiveThread(threadId);
  }

  async function handleAddReaction(emojiName: string) {
    if (!serverId) return;
    setShowEmojiPicker(false);
    try {
      await invoke("add_reaction", { serverId, postId: post.id, emojiName });
      refreshReactions();
    } catch (e) {
      console.error("Failed to add reaction:", e);
    }
  }

  async function handlePinToggle() {
    if (!serverId) return;
    try {
      if (post.is_pinned) {
        await invoke("unpin_post", { serverId, postId: post.id });
      } else {
        await invoke("pin_post", { serverId, postId: post.id });
      }
      // Update local state
      useMessagesStore.getState().updatePost({
        ...post,
        is_pinned: !post.is_pinned,
      });
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  }

  async function handleSave() {
    if (!serverId) return;
    try {
      await invoke("save_post", { serverId, postId: post.id });
    } catch (e) {
      console.error("Failed to save post:", e);
    }
  }

  function refreshReactions() {
    if (!serverId) return;
    invoke<Array<{ user_id: string; post_id: string; emoji_name: string; create_at: number }>>(
      "get_reactions",
      { serverId, postId: post.id },
    )
      .then((reactions) => {
        useMessagesStore.getState().updatePost({
          ...post,
          metadata: { ...post.metadata, reactions },
        });
      })
      .catch(console.error);
  }

  return (
    <div className={`message-item ${showAvatar ? "" : "continuation"} ${post.is_pinned ? "pinned" : ""}`}>
      {showAvatar ? (
        <div
          className="message-avatar clickable"
          title={username}
          ref={avatarRef}
          onClick={() => setShowPopover(true)}
        >
          {initials}
          <PresenceDot userId={post.user_id} />
        </div>
      ) : (
        <div className="message-gutter">
          <span className="message-hover-time">{timeStr}</span>
        </div>
      )}

      <div className="message-content-area">
        {showAvatar && (
          <div className="message-header">
            <span className="message-author">{displayName}</span>
            <span className="message-time">{timeStr}</span>
            {post.is_pinned && <span className="pin-badge">pinned</span>}
          </div>
        )}
        <div className="message-body">
          <MarkdownRenderer text={post.message} />
          {isEdited && <span className="message-edited">(edited)</span>}
        </div>

        {/* File attachments */}
        {post.file_ids && post.file_ids.length > 0 && serverId && (
          <FileAttachment fileIds={post.file_ids} serverId={serverId} />
        )}

        {/* Reactions bar */}
        {reactions.length > 0 && serverId && (
          <ReactionsBar
            reactions={reactions}
            postId={post.id}
            serverId={serverId}
            currentUserId={currentUserId}
            onReactionsChange={refreshReactions}
          />
        )}

        {/* Thread indicator */}
        {isThreadRoot && !hideThreadIndicator && (
          <button className="thread-indicator" onClick={handleOpenThread}>
            <span className="thread-indicator-count">
              {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
            </span>
          </button>
        )}

        {/* Action buttons */}
        <div className="message-actions">
          <button
            className="message-action-btn"
            onClick={() => setShowEmojiPicker(true)}
            title="Add reaction"
            aria-label="Add reaction"
          >
            +
          </button>
          <button
            className="message-action-btn"
            onClick={handleOpenThread}
            title="Reply in thread"
            aria-label="Reply in thread"
          >
            ↩
          </button>
          <button
            className="message-action-btn"
            onClick={handlePinToggle}
            title={post.is_pinned ? "Unpin" : "Pin"}
          >
            {post.is_pinned ? "Unpin" : "Pin"}
          </button>
          <button
            className="message-action-btn"
            onClick={handleSave}
            title="Save"
          >
            Save
          </button>
          {isOwn && (
            <>
              <button
                className="message-action-btn"
                onClick={() => onEdit(post.id)}
                title="Edit"
              >
                Edit
              </button>
              <button
                className="message-action-btn danger"
                onClick={() => onDelete(post.id)}
                title="Delete"
              >
                Del
              </button>
            </>
          )}
        </div>

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className="emoji-picker-anchor">
            <EmojiPicker
              onSelect={handleAddReaction}
              onClose={() => setShowEmojiPicker(false)}
            />
          </div>
        )}
      </div>

      {showPopover && serverId && (
        <UserPopover
          userId={post.user_id}
          serverId={serverId}
          anchorEl={avatarRef.current}
          onClose={() => setShowPopover(false)}
        />
      )}
    </div>
  );
});
