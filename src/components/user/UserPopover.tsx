import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";
import { useTabsStore } from "@/stores/tabsStore";
import { PresenceDot } from "@/components/message/PresenceDot";
import { UserAvatar } from "@/components/common/UserAvatar";
import { CustomEmojiRenderer } from "@/components/message/CustomEmojiRenderer";

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
  custom_attributes: string[];
}

interface Channel {
  id: string;
  display_name: string;
  name: string;
  channel_type: string;
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

function AddToChannelModal({
  userId,
  serverId,
  onClose,
}: {
  userId: string;
  serverId: string;
  onClose: () => void;
}) {
  const teamId = useUiStore((s) => s.activeTeamId);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!term.trim() || !teamId) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const channels = await invoke<Channel[]>("search_channels", {
          serverId,
          teamId,
          term: term.trim(),
        });
        // Only show public/private channels (not DM)
        setResults(channels.filter((c) => c.channel_type === "O" || c.channel_type === "P"));
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term, serverId, teamId]);

  async function handleAdd(channelId: string) {
    setAdding(channelId);
    setError(null);
    try {
      await invoke("add_user_to_channel", { serverId, channelId, userId });
      setDone(channelId);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : (e?.message ?? "Error");
      setError(msg);
    } finally {
      setAdding(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="add-to-channel-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="add-to-channel-header">
          <span>Add to channel</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <input
          ref={inputRef}
          className="add-to-channel-input"
          placeholder="Search channels..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        {error && <div className="add-to-channel-error">{error}</div>}
        <div className="add-to-channel-results">
          {loading && <div className="add-to-channel-hint">Searching...</div>}
          {!loading && term.trim() && results.length === 0 && (
            <div className="add-to-channel-hint">No channels found</div>
          )}
          {!loading && !term.trim() && (
            <div className="add-to-channel-hint">Start typing to search</div>
          )}
          {results.map((ch) => (
            <div key={ch.id} className="add-to-channel-item">
              <span className="add-to-channel-icon">
                {ch.channel_type === "P" ? "🔒" : "#"}
              </span>
              <span className="add-to-channel-name">{ch.display_name || ch.name}</span>
              {done === ch.id ? (
                <span className="add-to-channel-added">Added ✓</span>
              ) : (
                <button
                  className="add-to-channel-btn"
                  disabled={adding === ch.id}
                  onClick={() => handleAdd(ch.id)}
                >
                  {adding === ch.id ? "..." : "Add"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function UserPopover({
  userId,
  serverId,
  anchorEl,
  onClose,
}: UserPopoverProps) {
  const cachedUser = useUiStore((s) => s.users[userId] ?? null);
  const status = useUiStore((s) => s.userStatuses[userId] || "offline");
  const currentUserId = useUiStore((s) => s.currentUserId);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [openingDm, setOpeningDm] = useState(false);

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
          custom_attributes: [],
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
      if (showAddModal) return; // don't close popover while modal is open
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
      if (e.key === "Escape" && !showAddModal) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, anchorEl, showAddModal]);

  async function handleSendDm() {
    if (!profile) return;
    setOpeningDm(true);
    try {
      const channel = await invoke<{ id: string }>("create_direct_channel", {
        serverId,
        otherUserId: userId,
      });
      const store = useUiStore.getState();
      // Add channel to list if not already there
      const existing = store.channels.find((c) => c.id === channel.id);
      if (!existing) {
        store.setChannels([
          ...store.channels,
          {
            id: channel.id,
            team_id: "",
            display_name: profile.username,
            name: channel.id,
            channel_type: "D",
            header: "",
            purpose: "",
            last_post_at: Date.now(),
            total_msg_count: 0,
            msg_count: 0,
            mention_count: 0,
            last_viewed_at: 0,
          },
        ]);
      }
      store.setActiveChannelId(channel.id);
      store.setMainSubView("channels");
      useTabsStore.getState().navigateDefaultTab(channel.id);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setOpeningDm(false);
    }
  }

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

  const customAttrs = profile?.custom_attributes ?? [];

  const lastSeenText = profile?.last_activity_at
    ? formatLastSeen(profile.last_activity_at)
    : "";

  const isSelf = userId === currentUserId;

  return (
    <>
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
              {customAttrs.map((text, i) => (
                <div key={i} className="user-popover-custom-attr">
                  <CustomEmojiRenderer text={text} />
                </div>
              ))}
            </div>
            {!isSelf && (
              <div className="user-popover-actions">
                <button
                  className="user-popover-action-btn primary"
                  onClick={handleSendDm}
                  disabled={openingDm}
                >
                  {openingDm ? "Opening..." : "💬 Message"}
                </button>
                <button
                  className="user-popover-action-btn"
                  onClick={() => setShowAddModal(true)}
                >
                  ➕ Add to channel
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="user-popover-error">Failed to load profile</div>
        )}
      </div>
      {showAddModal && (
        <AddToChannelModal
          userId={userId}
          serverId={serverId}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  );
}
