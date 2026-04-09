import { useEffect, useRef, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useTauriDragDrop } from "@/hooks/useTauriDragDrop";
import { useThreadsStore } from "@/stores/threadsStore";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";
import { MessageItem } from "./MessageItem";
import { EmojiPicker, EMOJI_MAP } from "./EmojiPicker";

interface AttachedFile {
  path: string;
  name: string;
  previewUrl?: string;
  uploading: boolean;
  fileId?: string;
  error?: string;
}

interface FileUploadResult {
  file_infos: Array<{ id: string }>;
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "bmp", "webp"];

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

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerStyle, setEmojiPickerStyle] = useState<React.CSSProperties>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

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

  useTauriDragDrop(
    composerRef,
    (paths) => {
      const rp = threadPosts[activeThreadId!] || useMessagesStore.getState().posts[activeThreadId!];
      if (!rp) return;
      addFiles(paths.map((p) => ({ path: p, name: p.split(/[\\/]/).pop() ?? p })), rp.channel_id);
    },
    setIsDragging,
    !!activeThreadId,
  );

  if (!activeThreadId) return null;

  const rootPost = threadPosts[activeThreadId] || useMessagesStore.getState().posts[activeThreadId];

  async function uploadFile(path: string, name: string, channelId: string): Promise<string | undefined> {
    try {
      const result = await invoke<FileUploadResult>("upload_file", {
        serverId,
        channelId,
        filePath: path,
        fileName: name,
      });
      return result.file_infos[0]?.id;
    } catch (e) {
      console.error("Upload failed:", e);
      return undefined;
    }
  }

  async function addFiles(files: Array<{ path: string; name: string }>, channelId: string) {
    const newAttachments: AttachedFile[] = files.map((f) => ({ path: f.path, name: f.name, uploading: true }));
    setAttachments((prev) => [...prev, ...newAttachments]);

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isImage = IMAGE_EXTS.includes(ext);

      let previewUrl: string | undefined;
      if (isImage) {
        try {
          const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
          const data = await invoke<{ data_url: string }>("read_local_file_as_data_url", { filePath: file.path, mimeType });
          previewUrl = data.data_url;
        } catch { /* preview not critical */ }
      }

      const fileId = await uploadFile(file.path, file.name, channelId);
      setAttachments((prev) =>
        prev.map((a) => a.path === file.path
          ? { ...a, uploading: false, fileId, previewUrl, error: fileId ? undefined : "Upload failed" }
          : a
        )
      );
    }
  }

  async function handleAttachClick() {
    const rootPost = threadPosts[activeThreadId!] || useMessagesStore.getState().posts[activeThreadId!];
    if (!rootPost) return;
    try {
      const selected = await open({ multiple: true });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      await addFiles(paths.map((p) => ({ path: p, name: p.split("/").pop() ?? p })), rootPost.channel_id);
    } catch (e) {
      console.error("File picker error:", e);
    }
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    const rootPost = threadPosts[activeThreadId!] || useMessagesStore.getState().posts[activeThreadId!];
    if (!rootPost) return;

    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      try {
        const ext = item.type.split("/")[1] ?? "png";
        const tmpName = `clipboard_${Date.now()}.${ext}`;
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const tmpPath = await invoke<string>("save_temp_file", { fileName: tmpName, dataBase64 });
        await addFiles([{ path: tmpPath, name: tmpName }], rootPost.channel_id);
      } catch { /* ignore */ }
    }
  }

  function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }

  async function handleSend() {
    const trimmed = text.trim();
    const readyFileIds = attachments.filter((a) => a.fileId).map((a) => a.fileId!);
    if ((!trimmed && readyFileIds.length === 0) || sending || !activeThreadId) return;
    if (attachments.some((a) => a.uploading)) return;

    setSending(true);
    try {
      const rootPost = threadPosts[activeThreadId!] || useMessagesStore.getState().posts[activeThreadId!];
      const newPost = await invoke<PostData>("send_post", {
        serverId,
        channelId: rootPost?.channel_id ?? "",
        message: trimmed,
        rootId: activeThreadId,
        fileIds: readyFileIds.length > 0 ? readyFileIds : undefined,
      });
      useThreadsStore.getState().addThreadReply(newPost);
      useMessagesStore.getState().addPost(newPost);
      setText("");
      setAttachments([]);
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

  // Adjust textarea height
  function handleTextChange(value: string) {
    setText(value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 440) + "px";
    }
  }

  // Count replies (all posts except root)
  const replyCount = order.filter((id) => id !== activeThreadId).length;

  const canSend = (text.trim().length > 0 || attachments.some((a) => a.fileId)) && !sending && !attachments.some((a) => a.uploading);

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

      <div
        ref={composerRef}
        className={`thread-panel-composer ${isDragging ? "drag-over" : ""}`}
      >
        {isDragging && <div className="composer-drop-hint">Drop files to attach</div>}
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((att) => {
              const ext = att.name.split(".").pop()?.toLowerCase() ?? "";
              const isImage = IMAGE_EXTS.includes(ext);
              return (
                <div key={att.path} className={`composer-attachment ${att.error ? "error" : ""}`}>
                  {isImage && att.previewUrl ? (
                    <img src={att.previewUrl} alt={att.name} className="composer-attachment-thumb" />
                  ) : (
                    <span className="composer-attachment-icon">📄</span>
                  )}
                  <span className="composer-attachment-name">{att.name}</span>
                  {att.uploading && <span className="composer-attachment-status">⏳</span>}
                  {att.error && <span className="composer-attachment-status error">✗</span>}
                  {att.fileId && <span className="composer-attachment-status ok">✓</span>}
                  <button className="composer-attachment-remove" onClick={() => removeAttachment(att.path)} title="Remove">✕</button>
                </div>
              );
            })}
          </div>
        )}
        <div className="composer-input-row">
          <button
            className="composer-attach-btn"
            onClick={handleAttachClick}
            title="Attach file"
            disabled={sending}
          >
            📎
          </button>
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Reply..."
            rows={1}
            disabled={sending}
          />
          <div className="composer-emoji-wrap">
            <button
              ref={emojiTriggerRef}
              className="composer-emoji-btn"
              onClick={() => {
                setShowEmojiPicker((v) => {
                  if (!v && emojiTriggerRef.current) {
                    const rect = emojiTriggerRef.current.getBoundingClientRect();
                    const pickerHeight = 360;
                    const spaceAbove = rect.top;
                    if (spaceAbove >= pickerHeight) {
                      setEmojiPickerStyle({ bottom: "calc(100% + 6px)", top: "auto", right: 0 });
                    } else {
                      setEmojiPickerStyle({ top: "calc(100% + 6px)", bottom: "auto", right: 0 });
                    }
                  }
                  return !v;
                });
              }}
              title="Emoji"
              disabled={sending}
            >
              😊
            </button>
            {showEmojiPicker && (
              <div className="composer-emoji-popup" style={emojiPickerStyle}>
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
            disabled={!canSend}
            title="Send reply"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
