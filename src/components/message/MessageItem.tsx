import { useState, useRef, memo } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { CustomEmojiRenderer } from "./CustomEmojiRenderer";
import { PresenceDot } from "./PresenceDot";
import { UserAvatar } from "@/components/common/UserAvatar";
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
  onImageLoad?: () => void;
}

export const MessageItem = memo(function MessageItem({
  post,
  showAvatar,
  onEdit,
  onDelete,
  currentUserId,
  serverId,
  hideThreadIndicator,
  onImageLoad,
}: MessageItemProps) {
  const users = useUiStore((s) => s.users);
  const user = users[post.user_id];
  const [showPopover, setShowPopover] = useState(false);
  const [participantPopover, setParticipantPopover] = useState<{ userId: string; anchor: HTMLElement } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerStyle, setEmojiPickerStyle] = useState<React.CSSProperties>({});
  const [followLoading, setFollowLoading] = useState(false);
  const userThreads = useThreadsStore((s) => s.userThreads);
  const cachedParticipants = useThreadsStore((s) => s.threadParticipants[post.id]);
  const isFollowing = userThreads.find((t) => t.id === post.id)?.is_following ?? false;
  const avatarRef = useRef<HTMLDivElement>(null);
  const reactionBtnRef = useRef<HTMLButtonElement>(null);

  const displayName = user
    ? user.nickname ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.username
    : post.user_id.slice(0, 8);

  const username = user?.username ?? post.user_id.slice(0, 8);

  const isOwn = post.user_id === currentUserId;
  const isEdited = post.edit_at > 0;
  const isSystem = post.post_type !== "" && post.post_type !== undefined;
  const hasReplies = (post.reply_count ?? 0) > 0 && !post.root_id;
  const isThreadRoot = !post.root_id && hasReplies;

  const threadParticipants: Array<{ id: string }> = (() => {
    if (!isThreadRoot) return [];
    // 1. Reactive cached participants loaded in background by MessageList
    if (cachedParticipants && cachedParticipants.length > 0)
      return cachedParticipants.slice(0, 3).map((id) => ({ id }));
    const store = useThreadsStore.getState();
    // 2. Participants from userThreads (subscribed threads)
    const fromUserThreads = store.userThreads.find((t) => t.id === post.id)?.participants ?? [];
    if (fromUserThreads.length > 0) return fromUserThreads.slice(0, 3);
    // 3. Fallback: derive from loaded thread posts
    const order = store.threadOrder[post.id] ?? [];
    const seen = new Set<string>();
    const result: Array<{ id: string }> = [];
    for (const pid of order) {
      const p = store.threadPosts[pid];
      if (p && !seen.has(p.user_id)) {
        seen.add(p.user_id);
        result.push({ id: p.user_id });
        if (result.length === 3) break;
      }
    }
    return result;
  })();
  const reactions = post.metadata?.reactions || [];

  if (isSystem) {
    return (
      <div className="message-item system-message" data-post-id={post.id}>
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

  async function handleToggleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    if (!serverId || followLoading) return;
    const teamId = useUiStore.getState().activeTeamId;
    if (!teamId) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await invoke("unfollow_thread", { serverId, teamId, threadId: post.id });
      } else {
        await invoke("follow_thread", { serverId, teamId, threadId: post.id });
      }
      useThreadsStore.getState().updateThreadFollowing(post.id, !isFollowing);
    } catch (e) {
      console.error("Failed to toggle thread follow:", e);
    } finally {
      setFollowLoading(false);
    }
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
        const updated = { ...post, metadata: { ...post.metadata, reactions } };
        useMessagesStore.getState().updatePost(updated);
        // Also update in threads store if this post is a thread post
        useThreadsStore.getState().updateThreadPost(updated);
      })
      .catch(console.error);
  }

  return (
    <div className={`message-item ${showAvatar ? "" : "continuation"} ${post.is_pinned ? "pinned" : ""}`} data-post-id={post.id}>
      {showAvatar ? (
        <div
          className="message-avatar clickable"
          title={username}
          ref={avatarRef}
          onClick={() => setShowPopover(true)}
          style={{ position: "relative", overflow: "visible", background: "none", padding: 0 }}
        >
          <UserAvatar userId={post.user_id} username={user?.username || post.user_id} size={36} />
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
        <div
          className="message-body"
          onMouseDown={!post.root_id ? (e) => { if (e.button === 1) { e.preventDefault(); handleOpenThread(); } } : undefined}
        >
          <CustomEmojiRenderer text={post.message} />
          {isEdited && <span className="message-edited">(edited)</span>}
        </div>

        {/* File attachments */}
        {post.file_ids && post.file_ids.length > 0 && serverId && (
          <FileAttachment fileIds={post.file_ids} serverId={serverId} onImageLoad={onImageLoad} />
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
          <div className="thread-indicator-row">
            <button className="thread-indicator" onClick={handleOpenThread}>
              {threadParticipants.length > 0 && (
                <span className="thread-indicator-avatars" onClick={(e) => e.stopPropagation()}>
                  {threadParticipants.map((p) => {
                    const u = useUiStore.getState().users[p.id];
                    return (
                      <UserAvatar
                        key={p.id}
                        userId={p.id}
                        username={u?.username ?? p.id}
                        size={18}
                        className="thread-participant-avatar"
                        onClick={(e: React.MouseEvent<HTMLElement>) => {
                          setParticipantPopover({ userId: p.id, anchor: e.currentTarget });
                        }}
                      />
                    );
                  })}
                </span>
              )}
              <span className="thread-indicator-count">
                {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
              </span>
            </button>
            <button
              className={`thread-follow-btn ${isFollowing ? "following" : ""}`}
              onClick={handleToggleFollow}
              disabled={followLoading}
              title={isFollowing ? "Unfollow thread" : "Follow thread"}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="message-actions">
          <button
            ref={reactionBtnRef}
            className="message-action-btn"
            onClick={() => {
              if (!showEmojiPicker && reactionBtnRef.current) {
                const rect = reactionBtnRef.current.getBoundingClientRect();
                const pickerHeight = 360;
                if (rect.top >= pickerHeight) {
                  setEmojiPickerStyle({ bottom: "calc(100% + 6px)", top: "auto", right: 0 });
                } else {
                  setEmojiPickerStyle({ top: "calc(100% + 6px)", bottom: "auto", right: 0 });
                }
              }
              setShowEmojiPicker(true);
            }}
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
          <div className="emoji-picker-anchor" style={emojiPickerStyle}>
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

      {participantPopover && serverId && (
        <UserPopover
          userId={participantPopover.userId}
          serverId={serverId}
          anchorEl={participantPopover.anchor}
          onClose={() => setParticipantPopover(null)}
        />
      )}
    </div>
  );
});
