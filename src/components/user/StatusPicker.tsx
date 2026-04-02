import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";
import { EMOJI_MAP } from "@/components/message/EmojiPicker";

interface StatusPickerProps {
  serverId: string;
  currentUserId: string;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { value: "online", label: "Online", color: "var(--success)" },
  { value: "away", label: "Away", color: "#e2b714" },
  { value: "dnd", label: "Do Not Disturb", color: "var(--error)" },
  { value: "offline", label: "Offline", color: "#6c757d" },
];

const EXPIRY_OPTIONS = [
  { label: "Don't clear", value: "" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "4 hours", value: "4h" },
  { label: "Today", value: "today" },
];

function getExpiryDate(value: string): string | undefined {
  if (!value) return undefined;
  const now = new Date();
  switch (value) {
    case "30m": now.setMinutes(now.getMinutes() + 30); break;
    case "1h": now.setHours(now.getHours() + 1); break;
    case "4h": now.setHours(now.getHours() + 4); break;
    case "today": now.setHours(23, 59, 59, 999); break;
    default: return undefined;
  }
  return now.toISOString();
}

export function StatusPicker({ serverId, currentUserId, onClose }: StatusPickerProps) {
  const currentStatus = useUiStore((s) => s.userStatuses[currentUserId] || "online");
  const [updating, setUpdating] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("smile");
  const [customText, setCustomText] = useState("");
  const [customExpiry, setCustomExpiry] = useState("");

  async function handleSetStatus(status: string) {
    if (status === currentStatus) {
      onClose();
      return;
    }
    setUpdating(true);
    try {
      await invoke("set_user_status", { serverId, status });
      useUiStore.getState().setUserStatus(currentUserId, status);
      onClose();
    } catch (e) {
      console.error("Failed to set status:", e);
    } finally {
      setUpdating(false);
    }
  }

  async function handleSetCustomStatus() {
    if (!customText.trim()) return;
    setUpdating(true);
    try {
      await invoke("set_custom_status", {
        serverId,
        emoji: customEmoji,
        text: customText.trim(),
        expiresAt: getExpiryDate(customExpiry) ?? null,
      });
      onClose();
    } catch (e) {
      console.error("Failed to set custom status:", e);
    } finally {
      setUpdating(false);
    }
  }

  async function handleClearCustomStatus() {
    setUpdating(true);
    try {
      await invoke("clear_custom_status", { serverId });
      setCustomText("");
      setShowCustom(false);
    } catch (e) {
      console.error("Failed to clear custom status:", e);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <>
    <div className="status-picker-overlay" onClick={onClose} />
    <div className="status-picker">
      <div className="status-picker-title">Set Status</div>
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`status-picker-option ${currentStatus === opt.value ? "active" : ""}`}
          onClick={() => handleSetStatus(opt.value)}
          disabled={updating}
        >
          <span
            className="status-dot-icon"
            style={{ backgroundColor: opt.color }}
          />
          <span>{opt.label}</span>
        </button>
      ))}

      <div className="status-picker-divider" />

      <button
        className="status-picker-option"
        onClick={() => setShowCustom(!showCustom)}
      >
        <span className="status-dot-icon" style={{ background: "transparent", fontSize: 14 }}>
          {EMOJI_MAP[customEmoji] || "😄"}
        </span>
        <span>{showCustom ? "Hide Custom Status" : "Set Custom Status"}</span>
      </button>

      {showCustom && (
        <div className="custom-status-form">
          <div className="custom-status-row">
            <select
              className="custom-status-emoji-select"
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value)}
            >
              {Object.entries(EMOJI_MAP).map(([name, unicode]) => (
                <option key={name} value={name}>
                  {unicode} {name}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="custom-status-text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="What's your status?"
              maxLength={100}
            />
          </div>
          <div className="custom-status-row">
            <select
              className="custom-status-expiry"
              value={customExpiry}
              onChange={(e) => setCustomExpiry(e.target.value)}
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="custom-status-actions">
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleClearCustomStatus}
              disabled={updating}
            >
              Clear
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleSetCustomStatus}
              disabled={updating || !customText.trim()}
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
