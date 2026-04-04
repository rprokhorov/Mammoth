import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { UserAvatar } from "@/components/common/UserAvatar";
import { clearUserAvatarCache } from "@/hooks/useUserAvatar";

interface ProfileData {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string;
  position: string;
  avatar_url: string;
}

interface ProfileModalProps {
  serverId: string;
  userId: string;
  onClose: () => void;
}

export function ProfileModal({ serverId, userId, onClose }: ProfileModalProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [position, setPosition] = useState("");

  useEffect(() => {
    invoke<ProfileData>("get_user_profile", { serverId, userId })
      .then((p) => {
        setProfile(p);
        setFirstName(p.first_name || "");
        setLastName(p.last_name || "");
        setNickname(p.nickname || "");
        setPosition(p.position || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [serverId, userId]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await invoke("update_profile", {
        serverId,
        firstName: firstName || null,
        lastName: lastName || null,
        nickname: nickname || null,
        position: position || null,
      });
      setMessage("Profile updated");
    } catch (e) {
      setMessage(`Error: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadAvatar() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
      });
      if (!selected) return;

      const path = typeof selected === "string" ? selected : String(selected);
      await invoke("upload_avatar", { serverId, filePath: path });
      // Invalidate avatar cache so UserAvatar re-fetches
      clearUserAvatarCache(serverId, userId);
      setMessage("Avatar updated");
    } catch (e) {
      setMessage(`Error uploading avatar: ${e}`);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Profile</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {loading ? (
          <div className="modal-loading">
            <div className="spinner" />
          </div>
        ) : profile ? (
          <div className="profile-form">
            <div className="profile-avatar-section">
              <UserAvatar userId={profile.id} username={profile.username} size={80} className="profile-avatar-large" />
              <button
                className="btn btn-secondary"
                onClick={handleUploadAvatar}
              >
                Change Avatar
              </button>
            </div>

            <div className="profile-fields">
              <div className="form-group">
                <label>Username</label>
                <input type="text" value={profile.username} disabled />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="text" value={profile.email} disabled />
              </div>
              <div className="form-group">
                <label>First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Nickname</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Position</label>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                />
              </div>
            </div>

            {message && (
              <p className={message.startsWith("Error") ? "msg-error" : "msg-success"}>
                {message}
              </p>
            )}

            <div className="profile-actions">
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <p className="msg-error">Failed to load profile</p>
        )}
      </div>
    </div>
  );
}
