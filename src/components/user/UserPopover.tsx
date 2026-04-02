import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";
import { PresenceDot } from "@/components/message/PresenceDot";

interface UserProfile {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string;
  position: string;
  roles: string;
  locale: string;
  avatar_url: string;
}

interface UserPopoverProps {
  userId: string;
  serverId: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

export function UserPopover({
  userId,
  serverId,
  anchorEl,
  onClose,
}: UserPopoverProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const popoverRef = useRef<HTMLDivElement>(null);
  const status = useUiStore((s) => s.userStatuses[userId] || "offline");

  useEffect(() => {
    invoke<UserProfile>("get_user_profile", { serverId, userId })
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId, serverId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, anchorEl]);

  if (!anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();
  const style: React.CSSProperties = {
    position: "fixed",
    top: rect.bottom + 4,
    left: rect.left,
    zIndex: 1000,
  };

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");
  const isAdmin = profile?.roles?.includes("system_admin");

  return (
    <div className="user-popover" ref={popoverRef} style={style}>
      {loading ? (
        <div className="user-popover-loading">
          <div className="spinner small" />
        </div>
      ) : profile ? (
        <>
          <div className="user-popover-header">
            <div className="user-popover-avatar">
              <img src={profile.avatar_url} alt={profile.username} />
              <PresenceDot userId={userId} />
            </div>
            <div className="user-popover-names">
              <span className="user-popover-fullname">
                {fullName || profile.username}
              </span>
              <span className="user-popover-username">@{profile.username}</span>
              {profile.nickname && (
                <span className="user-popover-nickname">
                  {profile.nickname}
                </span>
              )}
            </div>
          </div>
          <div className="user-popover-details">
            {profile.position && (
              <div className="user-popover-row">
                <span className="user-popover-label">Position</span>
                <span>{profile.position}</span>
              </div>
            )}
            {isAdmin && (
              <div className="user-popover-row">
                <span className="user-popover-badge">Admin</span>
              </div>
            )}
            <div className="user-popover-row">
              <span className="user-popover-label">Status</span>
              <span className="user-popover-status">{status}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="user-popover-error">Failed to load profile</div>
      )}
    </div>
  );
}
