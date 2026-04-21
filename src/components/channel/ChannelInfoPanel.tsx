import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore, type SidebarCategory } from "@/stores/uiStore";
import { useTabsStore } from "@/stores/tabsStore";
import { MarkdownRenderer } from "@/components/message/MarkdownRenderer";
import { UserAvatar } from "@/components/common/UserAvatar";
import { UserPopover } from "@/components/user/UserPopover";

interface ChannelInfoPanelProps {
  serverId: string;
  onClose: () => void;
  width?: number;
}

type SubPanel = "members" | "pinned" | "files" | "notification-prefs" | null;

interface ChannelNotifyProps {
  mark_unread?: string;       // "all" | "mention"
  ignore_channel_mentions?: string; // "on" | "off" | "default"
  desktop?: string;           // "all" | "mention" | "none" | "default"
  desktop_threads?: string;   // "mention" | "default" — drives "notify about thread replies"
}

interface ChannelMember {
  user_id: string;
  roles: string;
}

interface UserInfo {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  nickname: string;
}

interface PostData {
  id: string;
  message: string;
  user_id: string;
  create_at: number;
}

interface PostList {
  order: string[];
  posts: Record<string, PostData>;
}

interface FileInfo {
  id: string;
  name: string;
  extension: string;
  size: number;
  mime_type: string;
  create_at: number;
  user_id: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

export function ChannelInfoPanel({
  serverId,
  onClose,
  width = 300,
}: ChannelInfoPanelProps) {
  const channels = useUiStore((s) => s.channels);
  const activeChannelId = useUiStore((s) => s.activeChannelId);
  const servers = useUiStore((s) => s.servers);
  const teams = useUiStore((s) => s.teams);
  const activeTeamId = useUiStore((s) => s.activeTeamId);
  const favoriteChannels = useUiStore((s) => s.favoriteChannels);
  const currentUserId = useUiStore((s) => s.currentUserId);
  const channelNotifyPropsCache = useUiStore((s) => s.channelNotifyProps);
  const updateChannelNotifyPropsStore = useUiStore((s) => s.updateChannelNotifyProps);
  const channel = channels.find((ch) => ch.id === activeChannelId);

  const [popover, setPopover] = useState<{ userId: string; anchor: HTMLElement } | null>(null);
  const [dmLoading, setDmLoading] = useState<string | null>(null);
  const avatarRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [subPanel, setSubPanel] = useState<SubPanel>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Members state
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [memberUsers, setMemberUsers] = useState<Record<string, UserInfo>>({});
  const [membersLoading, setMembersLoading] = useState(false);

  // Pinned state
  const [pinnedPosts, setPinnedPosts] = useState<PostData[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);

  // Files state
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // Notification prefs state
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifySaving, setNotifySaving] = useState(false);

  // Derive notifyProps reactively from the store cache so WS updates are reflected automatically
  const cachedRaw = activeChannelId ? channelNotifyPropsCache[activeChannelId] : undefined;
const notifyProps: ChannelNotifyProps | null = cachedRaw
    ? {
        mark_unread: cachedRaw.mark_unread ?? channel?.mark_unread ?? "all",
        ignore_channel_mentions: cachedRaw.ignore_channel_mentions ?? "default",
        desktop: cachedRaw.desktop ?? "default",
        desktop_threads: cachedRaw.desktop_threads ?? "default",
      }
    : null;

  useEffect(() => {
    setSubPanel(null);
  }, [activeChannelId]);

  useEffect(() => {
    if (subPanel === "members" && channel) {
      setMembersLoading(true);
      invoke<unknown>("get_channel_members_list", {
        serverId,
        channelId: channel.id,
      })
        .then(async (raw) => {
          const list = raw as ChannelMember[];
          const sorted = [...list].sort((a, b) => {
            const aAdmin = a.roles.includes("channel_admin") ? 0 : 1;
            const bAdmin = b.roles.includes("channel_admin") ? 0 : 1;
            return aAdmin - bAdmin;
          });
          setMembers(sorted);
          const ids = list.map((m) => m.user_id);
          if (ids.length > 0) {
            const users = await invoke<UserInfo[]>("get_users_by_ids", {
              serverId,
              userIds: ids,
            });
            const map: Record<string, UserInfo> = {};
            for (const u of users) map[u.id] = u;
            setMemberUsers(map);
          }
        })
        .catch(console.error)
        .finally(() => setMembersLoading(false));
    }
  }, [subPanel, channel?.id]);

  useEffect(() => {
    if (subPanel === "pinned" && channel) {
      setPinnedLoading(true);
      invoke<PostList>("get_pinned_posts", {
        serverId,
        channelId: channel.id,
      })
        .then((result) => {
          const posts = (result.order ?? []).map((id) => result.posts[id]).filter(Boolean);
          setPinnedPosts(posts);
        })
        .catch(console.error)
        .finally(() => setPinnedLoading(false));
    }
  }, [subPanel, channel?.id]);

  useEffect(() => {
    if (subPanel === "notification-prefs" && channel) {
      setNotifyLoading(true);
      invoke<Record<string, string>>("get_channel_notify_props", {
        serverId,
        channelId: channel.id,
      })
        .then((rawResult) => {
          const raw: Record<string, string> = rawResult as Record<string, string>;
          // API returns "default" when a setting is not explicitly configured.
          // For mark_unread, fall back to the store value which reflects the actual state.
          const storeMarkUnread = useUiStore.getState().channels.find(c => c.id === channel.id)?.mark_unread;
          // mark_unread: "" and "all" both mean "not muted"; "mention" means muted.
          // API can return "" (empty string) for the default/unmuted state — that is falsy in JS,
          // so we must check for undefined/null explicitly rather than using a truthy check.
          const rawMarkUnread = raw.mark_unread;
          const markUnread =
            rawMarkUnread !== undefined && rawMarkUnread !== null && rawMarkUnread !== "default"
              ? rawMarkUnread
              : (storeMarkUnread ?? "all");
          // Store in cache — panel reads reactively from store, so WS updates are reflected automatically
          updateChannelNotifyPropsStore(channel.id, {
            ...raw,
            mark_unread: markUnread,
          });
        })
        .catch(console.error)
        .finally(() => setNotifyLoading(false));
    }
  }, [subPanel, channel?.id]);

  useEffect(() => {
    if (subPanel === "files" && channel) {
      setFilesLoading(true);
      invoke<FileInfo[]>("get_channel_files", {
        serverId,
        channelId: channel.id,
      })
        .then(setFiles)
        .catch(console.error)
        .finally(() => setFilesLoading(false));
    }
  }, [subPanel, channel?.id]);

  if (!channel) return null;

  async function handleToggleFavorite() {
    if (!channel) return;
    const isFav = favoriteChannels.has(channel.id);
    useUiStore.getState().toggleFavorite(channel.id);
    try {
      await invoke("toggle_favorite_channel", {
        serverId,
        channelId: channel.id,
        favorite: !isFav,
      });
      // Reload sidebar categories so Favorites section updates
      if (activeTeamId) {
        const categories = await invoke<SidebarCategory[]>("get_sidebar_categories", { serverId, teamId: activeTeamId });
        useUiStore.getState().setSidebarCategories(categories);
      }
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
      useUiStore.getState().toggleFavorite(channel.id);
    }
  }

  async function handleToggleMute() {
    if (!channel) return;
    const muted = channel.mark_unread === "mention";
    const newLevel = muted ? "all" : "mention";
    useUiStore.getState().updateChannelMarkUnread(channel.id, newLevel);
    try {
      await invoke("update_channel_notify_props", {
        serverId,
        channelId: channel.id,
        notifyProps: { mark_unread: newLevel },
      });
    } catch (e) {
      console.error("Failed to toggle mute:", e);
      useUiStore.getState().updateChannelMarkUnread(channel.id, muted ? "mention" : "all");
    }
  }

  function handleCopyLink() {
    const server = servers.find((s) => s.id === serverId);
    const baseUrl = server?.url?.replace(/\/$/, "") ?? "";
    const team = teams.find((t) => t.id === activeTeamId);
    const teamName = team?.name ?? "";
    const link = `${baseUrl}/${teamName}/channels/${channel?.name ?? ""}`;
    navigator.clipboard.writeText(link).catch(console.error);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function getUserDisplayName(user: UserInfo): string {
    const full = [user.first_name, user.last_name].filter(Boolean).join(" ");
    return full || user.nickname || user.username;
  }

  async function handleSendDm(userId: string) {
    setDmLoading(userId);
    try {
      const dmChannel = await invoke<{ id: string }>("create_direct_channel", {
        serverId,
        otherUserId: userId,
      });
      const store = useUiStore.getState();
      const user = memberUsers[userId];
      if (!store.channels.find((c) => c.id === dmChannel.id)) {
        store.setChannels([
          ...store.channels,
          {
            id: dmChannel.id,
            team_id: "",
            display_name: user?.username ?? userId,
            name: dmChannel.id,
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
      store.setActiveChannelId(dmChannel.id);
      store.setMainSubView("channels");
      useTabsStore.getState().navigateDefaultTab(dmChannel.id);
      onClose();
    } catch (e) {
      console.error("Failed to open DM:", e);
    } finally {
      setDmLoading(null);
    }
  }

  const subPanelTitle =
    subPanel === "members" ? "Members" :
    subPanel === "pinned" ? "Pinned Messages" :
    subPanel === "files" ? "Files" :
    subPanel === "notification-prefs" ? "Notification Preferences" : null;

  async function handleNotifyPropChange(patch: Partial<ChannelNotifyProps>) {
    if (!channel || !notifyProps) return;
    const updated = { ...notifyProps, ...patch };
    // Optimistic update in store (panel reads reactively)
    updateChannelNotifyPropsStore(channel.id, patch as Record<string, string>);
    setNotifySaving(true);
    try {
      // Send only the known writable fields — exclude any extra fields the API may have returned
      await invoke("update_channel_notify_props", {
        serverId,
        channelId: channel.id,
        notifyProps: {
          mark_unread: updated.mark_unread,
          ignore_channel_mentions: updated.ignore_channel_mentions,
          desktop: updated.desktop,
          desktop_threads: updated.desktop_threads,
        },
      });
      // Sync mark_unread to the channels store so sidebar updates
      if (patch.mark_unread !== undefined) {
        useUiStore.getState().updateChannelMarkUnread(channel.id, patch.mark_unread);
      }
    } catch (e) {
      console.error("Failed to update notify props:", e);
      // Rollback optimistic update
      updateChannelNotifyPropsStore(channel.id, notifyProps as Record<string, string>);
    } finally {
      setNotifySaving(false);
    }
  }

  return (
    <div className="channel-info-panel" style={{ width }}>
      <div className="channel-info-panel-header">
        {subPanel ? (
          <button className="channel-info-back-btn" onClick={() => setSubPanel(null)} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>{subPanelTitle}</span>
          </button>
        ) : (
          <span className="channel-info-panel-title">
            {channel.channel_type === "O" ? "# " : channel.channel_type === "P" ? "🔒 " : ""}
            {channel.display_name}
          </span>
        )}
        <button className="thread-close-btn" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      {/* Main panel */}
      {!subPanel && (
        <div className="channel-info-panel-body">
          {/* Action buttons: Favorites, Mute, Copy Link */}
          <div className="channel-info-actions">
            <button
              className={`channel-info-action-btn${channel && favoriteChannels.has(channel.id) ? " active" : ""}`}
              onClick={handleToggleFavorite}
              title={channel && favoriteChannels.has(channel.id) ? "Remove from Favorites" : "Add to Favorites"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={channel && favoriteChannels.has(channel.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>{channel && favoriteChannels.has(channel.id) ? "Remove from Favorites" : "Add to Favorites"}</span>
            </button>
            <button
              className={`channel-info-action-btn${channel.mark_unread === "mention" ? " active" : ""}`}
              onClick={handleToggleMute}
              title={channel.mark_unread === "mention" ? "Unmute channel" : "Mute channel"}
            >
              {channel.mark_unread === "mention" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                  <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                  <path d="M18 8a6 6 0 0 0-9.33-5" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
              <span>{channel.mark_unread === "mention" ? "Unmute" : "Mute"}</span>
            </button>
            <button
              className={`channel-info-action-btn ${linkCopied ? "copy-link-copied" : ""}`}
              onClick={handleCopyLink}
              title="Copy Link"
            >
              {linkCopied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              )}
              <span>{linkCopied ? "Copied!" : "Copy Link"}</span>
            </button>
          </div>

          {/* Purpose */}
          {channel.purpose && (
            <div className="channel-info-section">
              <div className="channel-info-label">Purpose</div>
              <div className="channel-info-value">
                <MarkdownRenderer text={channel.purpose} />
              </div>
            </div>
          )}

          {/* Header */}
          {channel.header && (
            <div className="channel-info-section">
              <div className="channel-info-label">Channel Header</div>
              <div className="channel-info-value">
                <MarkdownRenderer text={channel.header} />
              </div>
            </div>
          )}

          {/* Channel ID */}
          <div className="channel-info-section">
            <div className="channel-info-id">
              <span className="channel-info-id-label">channel_id:</span>
              <span className="channel-info-id-value">{channel.id}</span>
            </div>
          </div>

          {/* Navigation buttons */}
          <div className="channel-info-nav-section">
            <button className="channel-info-nav-btn" onClick={() => setSubPanel("notification-prefs")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span>Notification Preferences</span>
              <svg className="channel-info-nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button className="channel-info-nav-btn" onClick={() => setSubPanel("members")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Members</span>
              <svg className="channel-info-nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button className="channel-info-nav-btn" onClick={() => setSubPanel("pinned")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
              </svg>
              <span>Pinned Messages</span>
              <svg className="channel-info-nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button className="channel-info-nav-btn" onClick={() => setSubPanel("files")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <span>Files</span>
              <svg className="channel-info-nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Members sub-panel */}
      {subPanel === "members" && (
        <div className="channel-info-panel-body">
          {membersLoading ? (
            <div className="channel-info-loading">Loading…</div>
          ) : members.length === 0 ? (
            <div className="channel-info-empty">No members found</div>
          ) : (
            <div className="channel-info-members-list">
              {members.map((m) => {
                const user = memberUsers[m.user_id];
                const isSelf = m.user_id === currentUserId;
                return (
                  <div key={m.user_id} className="channel-info-member-item">
                    <button
                      className="channel-info-member-avatar-btn"
                      ref={(el) => { avatarRefs.current[m.user_id] = el; }}
                      onClick={() => setPopover({ userId: m.user_id, anchor: avatarRefs.current[m.user_id]! })}
                      title="View profile"
                    >
                      <UserAvatar userId={m.user_id} username={user?.username ?? "?"} size={28} />
                    </button>
                    <div className="channel-info-member-info">
                      <span className="channel-info-member-name">
                        {user ? getUserDisplayName(user) : m.user_id}
                      </span>
                      {user && <span className="channel-info-member-username">@{user.username}</span>}
                    </div>
                    {m.roles.includes("channel_admin") && (
                      <span className="channel-info-member-role">Admin</span>
                    )}
                    {!isSelf && (
                      <button
                        className="channel-info-member-msg-btn"
                        title="Send message"
                        disabled={dmLoading === m.user_id}
                        onClick={() => handleSendDm(m.user_id)}
                      >
                        {dmLoading === m.user_id ? "…" : "➤"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pinned messages sub-panel */}
      {subPanel === "pinned" && (
        <div className="channel-info-panel-body">
          {pinnedLoading ? (
            <div className="channel-info-loading">Loading…</div>
          ) : pinnedPosts.length === 0 ? (
            <div className="channel-info-empty">No pinned messages</div>
          ) : (
            <div className="channel-info-pinned-list">
              {pinnedPosts.map((post) => (
                <div key={post.id} className="channel-info-pinned-item">
                  <div className="channel-info-pinned-meta">{formatDate(post.create_at)}</div>
                  <div className="channel-info-pinned-text">
                    <MarkdownRenderer text={post.message} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notification Preferences sub-panel */}
      {subPanel === "notification-prefs" && (
        <div className="channel-info-panel-body">
          {notifyLoading ? (
            <div className="channel-info-loading">Loading…</div>
          ) : !notifyProps ? (
            <div className="channel-info-empty">Failed to load preferences</div>
          ) : (
            <div className="notif-prefs">
              {/* Mute or ignore section */}
              <div className="notif-prefs-section">
                <div className="notif-prefs-section-title">Mute or ignore</div>

                <label className="notif-prefs-checkbox-row">
                  <input
                    type="checkbox"
                    checked={notifyProps.mark_unread === "mention"}
                    disabled={notifySaving}
                    onChange={(e) =>
                      handleNotifyPropChange({ mark_unread: e.target.checked ? "mention" : "all" })
                    }
                  />
                  <div className="notif-prefs-checkbox-label">
                    <span>Mute channel</span>
                    <span className="notif-prefs-desc">Turns off notifications for this channel. You'll still see badges if you're mentioned.</span>
                  </div>
                </label>

                <label className="notif-prefs-checkbox-row">
                  <input
                    type="checkbox"
                    checked={notifyProps.ignore_channel_mentions === "on"}
                    disabled={notifySaving}
                    onChange={(e) =>
                      handleNotifyPropChange({ ignore_channel_mentions: e.target.checked ? "on" : "off" })
                    }
                  />
                  <div className="notif-prefs-checkbox-label">
                    <span>Ignore mentions for @channel, @here and @all</span>
                    <span className="notif-prefs-desc">When enabled, @channel, @here and @all will not trigger mentions or mention notifications in this channel.</span>
                  </div>
                </label>
              </div>

              {/* Notify me about + Thread replies — only when channel is not muted */}
              {notifyProps.mark_unread !== "mention" && (
                <>
                  {/* Notify me about section */}
                  <div className="notif-prefs-section">
                    <div className="notif-prefs-section-title">Notify me about...</div>

                    <label className="notif-prefs-radio-row">
                      <input
                        type="radio"
                        name="desktop-notify"
                        checked={(notifyProps.desktop ?? "default") === "all"}
                        disabled={notifySaving}
                        onChange={() => handleNotifyPropChange({ desktop: "all" })}
                      />
                      <span>All new messages</span>
                    </label>

                    <label className="notif-prefs-radio-row">
                      <input
                        type="radio"
                        name="desktop-notify"
                        checked={
                          (notifyProps.desktop ?? "default") === "mention" ||
                          (notifyProps.desktop ?? "default") === "default"
                        }
                        disabled={notifySaving}
                        onChange={() => handleNotifyPropChange({ desktop: "mention" })}
                      />
                      <span>Mentions, direct messages and keywords only <span className="notif-prefs-default-badge">(default)</span></span>
                    </label>

                    <label className="notif-prefs-radio-row">
                      <input
                        type="radio"
                        name="desktop-notify"
                        checked={(notifyProps.desktop ?? "default") === "none"}
                        disabled={notifySaving}
                        onChange={() => handleNotifyPropChange({ desktop: "none" })}
                      />
                      <span>Nothing</span>
                    </label>
                  </div>

                  {/* Thread reply notifications section — only when "mentions only" is selected */}
                  {((notifyProps.desktop ?? "default") === "mention" || (notifyProps.desktop ?? "default") === "default") && (
                  <div className="notif-prefs-section">
                    <div className="notif-prefs-section-title">Thread reply notifications</div>

                    <label className="notif-prefs-checkbox-row">
                      <input
                        type="checkbox"
                        checked={notifyProps.desktop_threads !== "mention"}
                        disabled={notifySaving}
                        onChange={(e) =>
                          handleNotifyPropChange({ desktop_threads: e.target.checked ? "default" : "mention" })
                        }
                      />
                      <div className="notif-prefs-checkbox-label">
                        <span>Notify me about replies to threads I'm following</span>
                      </div>
                    </label>
                  </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* User popover */}
      {popover && (
        <UserPopover
          userId={popover.userId}
          serverId={serverId}
          anchorEl={popover.anchor}
          onClose={() => setPopover(null)}
        />
      )}

      {/* Files sub-panel */}
      {subPanel === "files" && (
        <div className="channel-info-panel-body">
          {filesLoading ? (
            <div className="channel-info-loading">Loading…</div>
          ) : files.length === 0 ? (
            <div className="channel-info-empty">No files shared</div>
          ) : (
            <div className="channel-info-files-list">
              {files.map((file) => (
                <div key={file.id} className="channel-info-file-item">
                  <div className="channel-info-file-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                      <polyline points="13 2 13 9 20 9" />
                    </svg>
                  </div>
                  <div className="channel-info-file-info">
                    <span className="channel-info-file-name">{file.name}</span>
                    <span className="channel-info-file-meta">
                      {file.extension.toUpperCase()} · {formatBytes(file.size)} · {formatDate(file.create_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
