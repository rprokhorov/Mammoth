import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMessagesStore, type PostData } from "@/stores/messagesStore";
import { EMOJI_MAP } from "./EmojiPicker";

interface MessageComposerProps {
  channelId: string;
  serverId: string;
}

const ALL_EMOJI_NAMES = Object.keys(EMOJI_MAP);

export function MessageComposer({ channelId, serverId }: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [emojiResults, setEmojiResults] = useState<string[]>([]);
  const [emojiSelectedIdx, setEmojiSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editingPostId = useMessagesStore((s) => s.editingPostId);
  const posts = useMessagesStore((s) => s.posts);
  const setEditingPostId = useMessagesStore((s) => s.setEditingPostId);
  const updatePost = useMessagesStore((s) => s.updatePost);
  const addPost = useMessagesStore((s) => s.addPost);

  const editingPost = editingPostId ? posts[editingPostId] : null;

  // When entering edit mode, populate textarea
  useEffect(() => {
    if (editingPost) {
      setText(editingPost.message);
      textareaRef.current?.focus();
    }
  }, [editingPostId]);

  // Focus textarea when channel changes
  useEffect(() => {
    setText("");
    setEditingPostId(null);
    textareaRef.current?.focus();
  }, [channelId]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 126) + "px";
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  // Emoji autocomplete: detect `:query` pattern
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = text.slice(0, cursor);
    // Match `:word` at the end (at least 2 chars after colon)
    const match = before.match(/:([a-z0-9_]{2,})$/);
    if (match) {
      const query = match[1];
      setEmojiQuery(query);
      const filtered = ALL_EMOJI_NAMES
        .filter((n) => n.includes(query))
        .slice(0, 8);
      setEmojiResults(filtered);
      setEmojiSelectedIdx(0);
    } else {
      setEmojiQuery(null);
      setEmojiResults([]);
    }
  }, [text]);

  function insertEmoji(emojiName: string) {
    const ta = textareaRef.current;
    if (!ta || emojiQuery === null) return;
    const cursor = ta.selectionStart;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    // Replace `:query` with `:emoji_name: `
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

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

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
      } else {
        const newPost = await invoke<PostData>("send_post", {
          serverId,
          channelId,
          message: trimmed,
        });
        addPost(newPost);
      }
      setText("");
    } catch (e) {
      console.error("Failed to send/edit:", e);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Emoji autocomplete keyboard nav
    if (emojiResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setEmojiSelectedIdx((i) => Math.min(i + 1, emojiResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setEmojiSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        if (emojiResults[emojiSelectedIdx]) {
          e.preventDefault();
          insertEmoji(emojiResults[emojiSelectedIdx]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setEmojiQuery(null);
        setEmojiResults([]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape" && editingPostId) {
      cancelEdit();
    }
  }

  function cancelEdit() {
    setEditingPostId(null);
    setText("");
    textareaRef.current?.focus();
  }

  return (
    <div className={`message-composer ${editingPost ? "editing" : ""}`}>
      {editingPost && (
        <div className="composer-edit-banner">
          Editing message
          <button className="cancel-edit" onClick={cancelEdit}>
            Cancel
          </button>
        </div>
      )}

      {/* Emoji autocomplete popup */}
      {emojiResults.length > 0 && (
        <div className="emoji-autocomplete">
          {emojiResults.map((name, i) => (
            <button
              key={name}
              className={`emoji-autocomplete-item ${i === emojiSelectedIdx ? "selected" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertEmoji(name);
              }}
            >
              <span className="emoji-autocomplete-icon">{EMOJI_MAP[name]}</span>
              <span className="emoji-autocomplete-name">:{name}:</span>
            </button>
          ))}
        </div>
      )}

      <div className="composer-input-row">
        <textarea
          ref={textareaRef}
          className="composer-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message..."
          rows={1}
          disabled={sending}
        />
        <button
          className="composer-send-btn"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          title={editingPost ? "Save edit" : "Send message"}
        >
          {editingPost ? "✓" : "➤"}
        </button>
      </div>
    </div>
  );
}
