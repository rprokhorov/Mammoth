import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useTauriDragDrop } from "@/hooks/useTauriDragDrop";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";
import { EMOJI_MAP, EmojiPicker } from "./EmojiPicker";
import { MarkdownToolbar, handleMarkdownShortcut } from "./MarkdownToolbar";

interface MessageComposerProps {
  channelId: string;
  serverId: string;
}

interface AttachedFile {
  path: string;
  name: string;
  previewUrl?: string; // base64 data URL for images
  uploading: boolean;
  fileId?: string;
  error?: string;
}

interface FileUploadResult {
  file_infos: Array<{ id: string; name: string; extension: string; mime_type: string }>;
}

interface SlashCommandSuggestion {
  Complete: string;
  Suggestion: string;
  Description: string;
  Hint: string;
  IconData: string;
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "bmp", "webp"];
const ALL_EMOJI_NAMES = Object.keys(EMOJI_MAP);

export function MessageComposer({ channelId, serverId }: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [emojiResults, setEmojiResults] = useState<string[]>([]);
  const [emojiSelectedIdx, setEmojiSelectedIdx] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerStyle, setEmojiPickerStyle] = useState<React.CSSProperties>({});
  const [slashResults, setSlashResults] = useState<SlashCommandSuggestion[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const activeTeamId = useUiStore((s) => s.activeTeamId);

  const editingPostId = useMessagesStore((s) => s.editingPostId);
  const posts = useMessagesStore((s) => s.posts);
  const setEditingPostId = useMessagesStore((s) => s.setEditingPostId);
  const updatePost = useMessagesStore((s) => s.updatePost);
  const addPost = useMessagesStore((s) => s.addPost);

  const editingPost = editingPostId ? posts[editingPostId] : null;

  useEffect(() => {
    if (editingPost) {
      setText(editingPost.message);
      textareaRef.current?.focus();
    }
  }, [editingPostId]);

  useEffect(() => {
    setText("");
    setAttachments([]);
    setEditingPostId(null);
    textareaRef.current?.focus();
  }, [channelId]);

  useTauriDragDrop(
    composerRef,
    (paths) => addFiles(paths.map((p) => ({ path: p, name: p.split(/[\\/]/).pop() ?? p }))),
    setIsDragging,
  );

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 440) + "px";
    }
  }, []);

  useEffect(() => { adjustHeight(); }, [text, adjustHeight]);

  // Emoji autocomplete
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = text.slice(0, cursor);
    const match = before.match(/:([a-z0-9_]{2,})$/);
    if (match) {
      const query = match[1];
      setEmojiQuery(query);
      setEmojiResults(ALL_EMOJI_NAMES.filter((n) => n.includes(query)).slice(0, 8));
      setEmojiSelectedIdx(0);
    } else {
      setEmojiQuery(null);
      setEmojiResults([]);
    }
  }, [text]);

  // Slash command autocomplete
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = text.slice(0, cursor);
    // Trigger when message starts with "/"
    if (before.match(/^\//)) {
      invoke<SlashCommandSuggestion[]>("autocomplete_slash_commands", {
        serverId,
        teamId: activeTeamId ?? "",
        channelId,
        command: before,
      })
        .then((results) => {
          setSlashResults(results);
          setSlashSelectedIdx(0);
        })
        .catch(() => setSlashResults([]));
    } else {
      setSlashResults([]);
    }
  }, [text, activeTeamId, serverId, channelId]);

  function selectSlashCommand(cmd: SlashCommandSuggestion) {
    const prefix = cmd.Complete.startsWith("/") ? cmd.Complete : "/" + cmd.Complete;
    setText(prefix + " ");
    setSlashResults([]);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function insertEmoji(emojiName: string) {
    const ta = textareaRef.current;
    if (!ta || emojiQuery === null) return;
    const cursor = ta.selectionStart;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const colonIdx = before.lastIndexOf(":");
    const newText = before.slice(0, colonIdx) + `:${emojiName}: ` + after;
    setText(newText);
    setEmojiQuery(null);
    setEmojiResults([]);
    requestAnimationFrame(() => {
      const newCursor = colonIdx + emojiName.length + 3;
      ta.setSelectionRange(newCursor, newCursor);
      ta.focus();
    });
  }

  function insertEmojiFromPicker(emojiName: string) {
    const ta = textareaRef.current;
    const unicode = EMOJI_MAP[emojiName] || `:${emojiName}: `;
    const cursor = ta ? ta.selectionStart : text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const newText = before + unicode + after;
    setText(newText);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      if (ta) {
        const newCursor = cursor + unicode.length;
        ta.setSelectionRange(newCursor, newCursor);
        ta.focus();
      }
    });
  }

  async function uploadFile(path: string, name: string): Promise<string | undefined> {
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

  async function addFiles(files: Array<{ path: string; name: string }>) {
    const newAttachments: AttachedFile[] = files.map((f) => ({
      path: f.path,
      name: f.name,
      uploading: true,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isImage = IMAGE_EXTS.includes(ext);

      // Generate preview for images by reading the local file
      let previewUrl: string | undefined;
      if (isImage) {
        try {
          const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
          const data = await invoke<{ data_url: string }>("read_local_file_as_data_url", {
            filePath: file.path,
            mimeType,
          });
          previewUrl = data.data_url;
        } catch {
          // preview not critical
        }
      }

      // Upload file
      const fileId = await uploadFile(file.path, file.name);

      setAttachments((prev) =>
        prev.map((a) =>
          a.path === file.path
            ? { ...a, uploading: false, fileId, previewUrl, error: fileId ? undefined : "Upload failed" }
            : a
        )
      );
    }
  }

  async function handleAttachClick() {
    try {
      const selected = await open({
        multiple: true,
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      await addFiles(paths.map((p) => ({ path: p, name: p.split("/").pop() ?? p })));
    } catch (e) {
      console.error("File picker error:", e);
    }
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;

    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      try {
        const ext = item.type.split("/")[1] ?? "png";
        const tmpName = `clipboard_${Date.now()}.${ext}`;
        // Read file blob as base64 in JS, then save to temp file via Rust
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // strip "data:...;base64," prefix
            resolve(result.split(",")[1] ?? "");
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const tmpPath = await invoke<string>("save_temp_file", {
          fileName: tmpName,
          dataBase64,
        });
        await addFiles([{ path: tmpPath, name: tmpName }]);
      } catch {
        // fallback: ignore
      }
    }
  }

  function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }

  async function handleSend() {
    const trimmed = text.trim();
    const readyFileIds = attachments.filter((a) => a.fileId).map((a) => a.fileId!);

    if (!trimmed && readyFileIds.length === 0) return;
    if (sending) return;
    if (attachments.some((a) => a.uploading)) return;

    setSending(true);
    try {
      if (editingPost) {
        const updated = await invoke<PostData>("edit_post", {
          serverId,
          postId: editingPost.id,
          message: trimmed,
        });
        updatePost(updated);
        setEditingPostId(null);
      } else if (trimmed.startsWith("/") && readyFileIds.length === 0) {
        const slashResult = await invoke<Record<string, unknown>>("execute_slash_command", {
          serverId,
          channelId,
          teamId: activeTeamId ?? null,
          command: trimmed,
        });
        // If response contains trigger_id, wait for WS open_dialog event (buffered in Rust)
        const triggerId = slashResult?.trigger_id as string | undefined;
        if (triggerId) {
          const { emit } = await import("@tauri-apps/api/event");
          // Poll the Rust buffer for up to 3s (WS event may arrive shortly after)
          let found = false;
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 300));
            const dialogPayload = await invoke<Record<string, unknown> | null>("poll_dialog", { triggerId });
            if (dialogPayload) {
              // dialog field may be a JSON string in WS event data
              let parsedDialog: unknown = dialogPayload.dialog;
              if (typeof parsedDialog === "string") {
                try { parsedDialog = JSON.parse(parsedDialog); } catch { /* use as-is */ }
              }
              if (!parsedDialog) parsedDialog = dialogPayload;
              // Unwrap nested { dialog: {...} } if needed
              const pd = parsedDialog as Record<string, unknown>;
              if (!Array.isArray(pd.elements) && pd.dialog && typeof pd.dialog === "object") {
                parsedDialog = pd.dialog;
              }
              emit("interactive_dialog_open", {
                serverId,
                triggerId,
                url: dialogPayload.url ?? "",
                dialog: parsedDialog,
              });
              found = true;
              break;
            }
          }
          // Fallback: try fetching via API directly
          if (!found) {
            const apiResult = await invoke<Record<string, unknown>>("fetch_dialog_by_trigger", { serverId, triggerId });
            console.log("fetch_dialog_by_trigger result:", JSON.stringify(apiResult));
            if (apiResult && apiResult.dialog) {
              emit("interactive_dialog_open", {
                serverId,
                triggerId,
                url: apiResult.url ?? "",
                dialog: apiResult.dialog,
              });
            }
          }
        }
      } else {
        const newPost = await invoke<PostData>("send_post", {
          serverId,
          channelId,
          message: trimmed,
          fileIds: readyFileIds.length > 0 ? readyFileIds : undefined,
        });
        addPost(newPost);
      }
      setText("");
      setAttachments([]);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (e) {
      console.error("Failed to send:", e);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (handleMarkdownShortcut(e, textareaRef, text, setText)) return;
    if (slashResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashSelectedIdx((i) => Math.min(i + 1, slashResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashSelectedIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        if (slashResults[slashSelectedIdx]) { e.preventDefault(); selectSlashCommand(slashResults[slashSelectedIdx]); return; }
      }
      if (e.key === "Escape") { e.preventDefault(); setSlashResults([]); return; }
    }
    if (emojiResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setEmojiSelectedIdx((i) => Math.min(i + 1, emojiResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setEmojiSelectedIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        if (emojiResults[emojiSelectedIdx]) { e.preventDefault(); insertEmoji(emojiResults[emojiSelectedIdx]); return; }
      }
      if (e.key === "Escape") { e.preventDefault(); setEmojiQuery(null); setEmojiResults([]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape" && editingPostId) { cancelEdit(); }
  }

  function cancelEdit() {
    setEditingPostId(null);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    textareaRef.current?.focus();
  }

  const canSend = (text.trim().length > 0 || attachments.some((a) => a.fileId)) && !sending && !attachments.some((a) => a.uploading);

  return (
    <div
      ref={composerRef}
      className={`message-composer ${editingPost ? "editing" : ""} ${isDragging ? "drag-over" : ""}`}
    >
      {editingPost && (
        <div className="composer-edit-banner">
          Editing message
          <button className="cancel-edit" onClick={cancelEdit}>Cancel</button>
        </div>
      )}

      {isDragging && (
        <div className="composer-drop-hint">Drop files to attach</div>
      )}

      {/* Slash command autocomplete */}
      {slashResults.length > 0 && (
        <div className="slash-autocomplete">
          {slashResults.map((cmd, i) => (
            <button
              key={cmd.Complete}
              className={`slash-autocomplete-item ${i === slashSelectedIdx ? "selected" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); selectSlashCommand(cmd); }}
            >
              <span className="slash-autocomplete-trigger">{cmd.Complete}</span>
              <span className="slash-autocomplete-hint">{cmd.Hint}</span>
              <span className="slash-autocomplete-desc">{cmd.Description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji autocomplete */}
      {emojiResults.length > 0 && (
        <div className="emoji-autocomplete">
          {emojiResults.map((name, i) => (
            <button
              key={name}
              className={`emoji-autocomplete-item ${i === emojiSelectedIdx ? "selected" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); insertEmoji(name); }}
            >
              <span className="emoji-autocomplete-icon">{EMOJI_MAP[name]}</span>
              <span className="emoji-autocomplete-name">:{name}:</span>
            </button>
          ))}
        </div>
      )}

      {/* Attachments preview */}
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
                <button
                  className="composer-attachment-remove"
                  onClick={() => removeAttachment(att.path)}
                  title="Remove"
                >✕</button>
              </div>
            );
          })}
        </div>
      )}

      <MarkdownToolbar
        textareaRef={textareaRef}
        text={text}
        setText={setText}
        disabled={sending}
      />

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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Write a message..."
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
          title={editingPost ? "Save edit" : "Send message"}
        >
          {editingPost ? "✓" : "➤"}
        </button>
      </div>
    </div>
  );
}
