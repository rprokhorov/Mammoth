import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";
import { PresenceDot } from "@/components/message/PresenceDot";
import { UserAvatar } from "@/components/common/UserAvatar";
import { MarkdownRenderer } from "@/components/message/MarkdownRenderer";

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
  last_activity_at: number;
  props: Record<string, string> | null;
}

interface UserPopoverProps {
  userId: string;
  serverId: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

function formatLastSeen(ts: number): string {
  if (!ts) return "";
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function UserPopover({
  userId,
  serverId,
  anchorEl,
  onClose,
}: UserPopoverProps) {
  const cachedUser = useUiStore((s) => s.users[userId] ?? null);
  const status = useUiStore((s) => s.userStatuses[userId] || "offline");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Start with cached data immediately (no loading state shown)
  const [profile, setProfile] = useState<UserProfile | null>(
    cachedUser
      ? {
          id: cachedUser.id,
          username: cachedUser.username,
          email: cachedUser.email,
          first_name: cachedUser.first_name,
          last_name: cachedUser.last_name,
          nickname: cachedUser.nickname,
          position: "",
          roles: "",
          locale: "",
          avatar_url: "",
          last_activity_at: 0,
          props: null,
        }
      : null,
  );
  const [loading, setLoading] = useState(!cachedUser);

  useEffect(() => {
    // Always fetch full profile in background to get position, roles, props, last_activity_at
    invoke<UserProfile>("get_user_profile", { serverId, userId })
      .then((p) => setProfile(p))
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

  // Extract custom attributes from props (keys starting with "customAttribute" or any non-system key)
  const customAttrs: Array<{ key: string; value: string }> = [];
  if (profile?.props) {
    for (const [k, v] of Object.entries(profile.props)) {
      if (typeof v === "string" && v.trim()) {
        customAttrs.push({ key: k, value: v });
      }
    }
  }

  const lastSeenText = profile?.last_activity_at
    ? formatLastSeen(profile.last_activity_at)
    : "";

  return (
    <div className="user-popover" ref={popoverRef} style={style}>
      {loading && !profile ? (
        <div className="user-popover-loading">
          <div className="spinner small" />
        </div>
      ) : profile ? (
        <>
          <div className="user-popover-header">
            <div className="user-popover-avatar">
              <UserAvatar userId={profile.id} username={profile.username} size={56} />
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
              {status === "offline" && lastSeenText && (
                <span className="user-popover-last-seen"> · {lastSeenText}</span>
              )}
            </div>
            {customAttrs.map(({ key, value }) => (
              <div key={key} className="user-popover-custom-attr">
                <MarkdownRenderer text={value} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="user-popover-error">Failed to load profile</div>
      )}
    </div>
  );
}
