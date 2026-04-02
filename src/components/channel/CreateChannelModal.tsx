import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface CreateChannelModalProps {
  serverId: string;
  teamId: string;
  onClose: () => void;
  onCreated: (channelId: string) => void;
}

export function CreateChannelModal({
  serverId,
  teamId,
  onClose,
  onCreated,
}: CreateChannelModalProps) {
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState("O");
  const [purpose, setPurpose] = useState("");
  const [header, setHeader] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate URL-safe name from display name
  useEffect(() => {
    const slug = displayName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    setName(slug);
  }, [displayName]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  async function handleCreate() {
    if (!displayName.trim() || !name.trim()) {
      setError("Channel name is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const channel = await invoke<{ id: string }>("create_channel", {
        serverId,
        teamId,
        name,
        displayName: displayName.trim(),
        channelType,
        purpose: purpose.trim() || null,
        header: header.trim() || null,
      });
      onCreated(channel.id);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content create-channel-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Create Channel</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="create-channel-form">
          <div className="form-group">
            <label>Channel Type</label>
            <select
              className="settings-select"
              value={channelType}
              onChange={(e) => setChannelType(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="O">Public Channel</option>
              <option value="P">Private Channel</option>
            </select>
          </div>

          <div className="form-group">
            <label>Channel Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Design Team"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>URL</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. design-team"
            />
          </div>

          <div className="form-group">
            <label>Purpose (optional)</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="What is this channel about?"
            />
          </div>

          <div className="form-group">
            <label>Header (optional)</label>
            <input
              type="text"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="Topic or links for the channel header"
            />
          </div>

          {error && <p className="msg-error">{error}</p>}

          <div className="profile-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={creating || !displayName.trim()}
            >
              {creating ? "Creating..." : "Create Channel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
