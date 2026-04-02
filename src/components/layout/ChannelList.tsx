import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore, type ChannelInfo } from "@/stores/uiStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useTabsStore } from "@/stores/tabsStore";

interface ChannelListProps {
  onSelectChannel: (channelId: string) => void;
  onCreateChannel?: () => void;
  serverId?: string | null;
  currentUserId?: string | null;
}

export function ChannelList({ onSelectChannel, onCreateChannel, serverId, currentUserId }: ChannelListProps) {
  const channels = useUiStore((s) => s.channels);
  const activeChannelId = useUiStore((s) => s.activeChannelId);
  const users = useUiStore((s) => s.users);
  const mainSubView = useUiStore((s) => s.mainSubView);
  const favoriteChannels = useUiStore((s) => s.favoriteChannels);
  const userThreadsUnread = useThreadsStore((s) => s.userThreadsUnread);

  const [contextMenu, setContextMenu] = useState<{
    channelId: string;
    x: number;
    y: number;
  } | null>(null);

  const favoriteList = channels.filter((ch) => favoriteChannels.has(ch.id));
  const publicChannels = channels.filter((ch) => ch.channel_type === "O" && !favoriteChannels.has(ch.id));
  const privateChannels = channels.filter((ch) => ch.channel_type === "P" && !favoriteChannels.has(ch.id));
  const dmChannels = channels.filter(
    (ch) => (ch.channel_type === "D" || ch.channel_type === "G") && !favoriteChannels.has(ch.id),
  );

  publicChannels.sort((a, b) => a.display_name.localeCompare(b.display_name));
  privateChannels.sort((a, b) => a.display_name.localeCompare(b.display_name));
  favoriteList.sort((a, b) => a.display_name.localeCompare(b.display_name));
  dmChannels.sort((a, b) => b.last_post_at - a.last_post_at);

  function getDisplayName(channel: ChannelInfo): string {
    if (channel.channel_type === "D") {
      // DM name is "userId1__userId2" — show the OTHER user, not the current one
      const parts = channel.name.split("__");
      for (const part of parts) {
        if (part === currentUserId) continue;
        const user = users[part];
        if (user) {
          return user.nickname || `${user.first_name} ${user.last_name}`.trim() || user.username;
        }
      }
      // Fallback: show any user found
      for (const part of parts) {
        const user = users[part];
        if (user) {
          return user.nickname || `${user.first_name} ${user.last_name}`.trim() || user.username;
        }
      }
      return channel.display_name || "Direct Message";
    }
    return channel.display_name;
  }

  function getPrefix(channel: ChannelInfo): string {
    if (channel.channel_type === "O") return "#";
    if (channel.channel_type === "P") return "🔒";
    return "";
  }

  function isUnread(channel: ChannelInfo): boolean {
    return channel.mention_count > 0;
  }

  function handleThreadsClick() {
    const store = useUiStore.getState();
    if (mainSubView === "threads") {
      store.setMainSubView("channels");
    } else {
      store.setActiveChannelId(null);
      store.setMainSubView("threads");
    }
  }

  function handleContextMenu(e: React.MouseEvent, channelId: string) {
    e.preventDefault();
    setContextMenu({ channelId, x: e.clientX, y: e.clientY });
  }

  function handleMiddleClick(channelId: string) {
    useTabsStore.getState().openTab(channelId);
    onSelectChannel(channelId);
  }

  async function handleToggleFavorite(channelId: string) {
    const isFav = favoriteChannels.has(channelId);
    useUiStore.getState().toggleFavorite(channelId);
    setContextMenu(null);
    if (serverId) {
      try {
        await invoke("toggle_favorite_channel", {
          serverId,
          channelId,
          favorite: !isFav,
        });
      } catch (e) {
        console.error("Failed to toggle favorite:", e);
        // Revert
        useUiStore.getState().toggleFavorite(channelId);
      }
    }
  }

  async function handleSetNotifyPref(channelId: string, level: string) {
    setContextMenu(null);
    if (!serverId) return;
    try {
      await invoke("update_channel_notify_props", {
        serverId,
        channelId,
        notifyProps: { mark_unread: level },
      });
    } catch (e) {
      console.error("Failed to update notification prefs:", e);
    }
  }

  return (
    <nav className="channel-list" aria-label="Channels">
      <button
        className={`channel-item threads-nav-btn ${mainSubView === "threads" ? "active" : ""}`}
        onClick={handleThreadsClick}
      >
        <span className="channel-prefix">💬</span>
        <span className="channel-name">Threads</span>
        {userThreadsUnread > 0 && (
          <span className="mention-badge">{userThreadsUnread}</span>
        )}
      </button>
      {onCreateChannel && (
        <button
          className="channel-item create-channel-btn"
          onClick={onCreateChannel}
        >
          <span className="channel-prefix">+</span>
          <span className="channel-name">Create Channel</span>
        </button>
      )}

      {favoriteList.length > 0 && (
        <ChannelGroup
          title="Favorites"
          channels={favoriteList}
          activeId={activeChannelId}
          getDisplayName={getDisplayName}
          getPrefix={getPrefix}
          isUnread={isUnread}
          onSelect={onSelectChannel}
          onContextMenu={handleContextMenu}
          onMiddleClick={handleMiddleClick}
        />
      )}
      <ChannelGroup
        title="Public Channels"
        channels={publicChannels}
        activeId={activeChannelId}
        getDisplayName={getDisplayName}
        getPrefix={() => "#"}
        isUnread={isUnread}
        onSelect={onSelectChannel}
        onContextMenu={handleContextMenu}
        onMiddleClick={handleMiddleClick}
      />
      <ChannelGroup
        title="Private Channels"
        channels={privateChannels}
        activeId={activeChannelId}
        getDisplayName={getDisplayName}
        getPrefix={() => "🔒"}
        isUnread={isUnread}
        onSelect={onSelectChannel}
        onContextMenu={handleContextMenu}
        onMiddleClick={handleMiddleClick}
      />
      <ChannelGroup
        title="Direct Messages"
        channels={dmChannels}
        activeId={activeChannelId}
        getDisplayName={getDisplayName}
        getPrefix={() => ""}
        isUnread={isUnread}
        onSelect={onSelectChannel}
        onContextMenu={handleContextMenu}
        onMiddleClick={handleMiddleClick}
      />

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="context-menu-overlay"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              className="context-menu-item"
              onClick={() => {
                useTabsStore.getState().openTab(contextMenu.channelId);
                onSelectChannel(contextMenu.channelId);
                setContextMenu(null);
              }}
            >
              Open in Tab
            </button>
            <div className="context-menu-divider" />
            <button
              className="context-menu-item"
              onClick={() => handleToggleFavorite(contextMenu.channelId)}
            >
              {favoriteChannels.has(contextMenu.channelId) ? "Remove from Favorites" : "Add to Favorites"}
            </button>
            <div className="context-menu-divider" />
            <div className="context-menu-label">Notifications</div>
            <button
              className="context-menu-item"
              onClick={() => handleSetNotifyPref(contextMenu.channelId, "all")}
            >
              All messages
            </button>
            <button
              className="context-menu-item"
              onClick={() => handleSetNotifyPref(contextMenu.channelId, "mention")}
            >
              Mentions only
            </button>
            <button
              className="context-menu-item"
              onClick={() => handleSetNotifyPref(contextMenu.channelId, "none")}
            >
              Mute channel
            </button>
          </div>
        </>
      )}
    </nav>
  );
}

interface ChannelGroupProps {
  title: string;
  channels: ChannelInfo[];
  activeId: string | null;
  getDisplayName: (ch: ChannelInfo) => string;
  getPrefix: (ch: ChannelInfo) => string;
  isUnread: (ch: ChannelInfo) => boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, channelId: string) => void;
  onMiddleClick: (channelId: string) => void;
}

function ChannelGroup({
  title,
  channels,
  activeId,
  getDisplayName,
  getPrefix,
  isUnread,
  onSelect,
  onContextMenu,
  onMiddleClick,
}: ChannelGroupProps) {
  if (channels.length === 0) return null;

  return (
    <div className="channel-group">
      <div className="channel-group-title">{title}</div>
      {channels.map((ch) => (
        <button
          key={ch.id}
          className={`channel-item ${activeId === ch.id ? "active" : ""} ${isUnread(ch) ? "unread" : ""}`}
          onClick={() => onSelect(ch.id)}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              onMiddleClick(ch.id);
            }
          }}
          onContextMenu={(e) => onContextMenu(e, ch.id)}
        >
          <span className="channel-prefix">{getPrefix(ch)}</span>
          <span className="channel-name">{getDisplayName(ch)}</span>
          {ch.mention_count > 0 && (
            <span className="mention-badge">{ch.mention_count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
