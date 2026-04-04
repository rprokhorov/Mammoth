import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore, type ChannelInfo, type SidebarCategory } from "@/stores/uiStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useTabsStore } from "@/stores/tabsStore";
import { UserAvatar } from "@/components/common/UserAvatar";

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
  const sidebarCategories = useUiStore((s) => s.sidebarCategories);
  const userThreadsUnread = useThreadsStore((s) => s.userThreadsUnread);

  const [contextMenu, setContextMenu] = useState<{
    channelId: string;
    x: number;
    y: number;
  } | null>(null);

  const [categoryMenu, setCategoryMenu] = useState<{
    categoryId: string;
    x: number;
    y: number;
  } | null>(null);

  // Inline rename state
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // New category inline creation
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const newCategoryInputRef = useRef<HTMLInputElement>(null);

  // Move-to-category submenu visibility
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);

  // Collapsed categories
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Drag-and-drop state
  const [dragChannelId, setDragChannelId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (renamingCategoryId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingCategoryId]);

  useEffect(() => {
    if (creatingCategory && newCategoryInputRef.current) {
      newCategoryInputRef.current.focus();
    }
  }, [creatingCategory]);

  // Channel lookup map
  const channelMap = new Map<string, ChannelInfo>(channels.map((ch) => [ch.id, ch]));

  function getDisplayName(channel: ChannelInfo): string {
    if (channel.channel_type === "D") {
      const parts = channel.name.split("__");
      for (const part of parts) {
        if (part === currentUserId) continue;
        const user = users[part];
        if (user) {
          return user.nickname || `${user.first_name} ${user.last_name}`.trim() || user.username;
        }
      }
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
    if (channel.channel_type === "P") return "\uD83D\uDD12";
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
    setShowMoveSubmenu(false);
    setContextMenu({ channelId, x: e.clientX, y: e.clientY });
    setCategoryMenu(null);
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

  // Move channel to a category
  async function handleMoveToCategory(channelId: string, targetCategoryId: string | null) {
    setContextMenu(null);
    if (!serverId) return;

    const store = useUiStore.getState();
    const categories = store.sidebarCategories;
    const teamId = store.activeTeamId;
    if (!teamId) return;

    if (targetCategoryId === null) {
      // Remove from all custom categories (move back to default based on channel type)
      const updatedCategories = categories.map((cat) => {
        if (cat.category_type === "custom" && cat.channel_ids.includes(channelId)) {
          return { ...cat, channel_ids: cat.channel_ids.filter((id) => id !== channelId) };
        }
        return cat;
      });
      // Apply updates
      for (const cat of updatedCategories) {
        const orig = categories.find((c) => c.id === cat.id);
        if (orig && orig.channel_ids.length !== cat.channel_ids.length) {
          try {
            const updated = await invoke<SidebarCategory>("update_sidebar_category", {
              serverId,
              teamId,
              category: {
                id: cat.id,
                user_id: cat.user_id,
                team_id: cat.team_id,
                display_name: cat.display_name,
                channel_ids: cat.channel_ids,
                sort_order: cat.sort_order,
                category_type: cat.category_type,
                sorting: cat.sorting,
                muted: cat.muted,
                collapsed: cat.collapsed,
              },
            });
            store.updateSidebarCategory(updated);
          } catch (e) {
            console.error("Failed to remove channel from category:", e);
          }
        }
      }
      return;
    }

    // Remove from current custom categories and add to target
    const updatesNeeded: SidebarCategory[] = [];
    for (const cat of categories) {
      if (cat.id === targetCategoryId) {
        if (!cat.channel_ids.includes(channelId)) {
          updatesNeeded.push({ ...cat, channel_ids: [...cat.channel_ids, channelId] });
        }
      } else if (cat.category_type === "custom" && cat.channel_ids.includes(channelId)) {
        updatesNeeded.push({ ...cat, channel_ids: cat.channel_ids.filter((id) => id !== channelId) });
      }
    }

    for (const cat of updatesNeeded) {
      try {
        const updated = await invoke<SidebarCategory>("update_sidebar_category", {
          serverId,
          teamId,
          category: {
            id: cat.id,
            user_id: cat.user_id,
            team_id: cat.team_id,
            display_name: cat.display_name,
            channel_ids: cat.channel_ids,
            sort_order: cat.sort_order,
            category_type: cat.category_type,
            sorting: cat.sorting,
            muted: cat.muted,
            collapsed: cat.collapsed,
          },
        });
        store.updateSidebarCategory(updated);
      } catch (e) {
        console.error("Failed to move channel to category:", e);
      }
    }
  }

  function handleCategoryContextMenu(e: React.MouseEvent, categoryId: string) {
    e.preventDefault();
    e.stopPropagation();
    setCategoryMenu({ categoryId, x: e.clientX, y: e.clientY });
    setContextMenu(null);
  }

  function handleStartRename(categoryId: string, currentName: string) {
    setCategoryMenu(null);
    setRenamingCategoryId(categoryId);
    setRenameValue(currentName);
  }

  async function handleRenameSubmit(categoryId: string) {
    const trimmed = renameValue.trim();
    setRenamingCategoryId(null);
    if (!trimmed || !serverId) return;

    const store = useUiStore.getState();
    const teamId = store.activeTeamId;
    const cat = store.sidebarCategories.find((c) => c.id === categoryId);
    if (!cat || !teamId) return;

    try {
      const updated = await invoke<SidebarCategory>("update_sidebar_category", {
        serverId,
        teamId,
        category: {
          id: cat.id,
          user_id: cat.user_id,
          team_id: cat.team_id,
          display_name: trimmed,
          channel_ids: cat.channel_ids,
          sort_order: cat.sort_order,
          category_type: cat.category_type,
          sorting: cat.sorting,
          muted: cat.muted,
          collapsed: cat.collapsed,
        },
      });
      store.updateSidebarCategory(updated);
    } catch (e) {
      console.error("Failed to rename category:", e);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    setCategoryMenu(null);
    if (!serverId) return;
    const store = useUiStore.getState();
    const teamId = store.activeTeamId;
    if (!teamId) return;

    try {
      await invoke("delete_sidebar_category", { serverId, teamId, categoryId });
      store.removeSidebarCategory(categoryId);
    } catch (e) {
      console.error("Failed to delete category:", e);
    }
  }

  async function handleCreateCategorySubmit() {
    const trimmed = newCategoryName.trim();
    setCreatingCategory(false);
    setNewCategoryName("");
    if (!trimmed || !serverId) return;

    const store = useUiStore.getState();
    const teamId = store.activeTeamId;
    if (!teamId) return;

    try {
      const created = await invoke<SidebarCategory>("create_sidebar_category", {
        serverId,
        teamId,
        displayName: trimmed,
        channelIds: [],
      });
      store.addSidebarCategory(created);
    } catch (e) {
      console.error("Failed to create category:", e);
    }
  }

  function toggleCollapseCategory(categoryId: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  function getCategoryDisplayName(cat: SidebarCategory): string {
    if (cat.category_type === "favorites") return "Favorites";
    if (cat.category_type === "channels") return "Channels";
    if (cat.category_type === "direct_messages") return "Direct Messages";
    return cat.display_name;
  }

  // Render with sidebar categories if available, fallback to static grouping
  const useCategoryView = sidebarCategories.length > 0;

  const customCategories = sidebarCategories.filter((c) => c.category_type === "custom");

  // Fallback static grouping
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

  function getDmUserId(ch: ChannelInfo): string | null {
    if (ch.channel_type !== "D") return null;
    const parts = ch.name.split("__");
    return parts.find((p) => p !== currentUserId) ?? parts[0] ?? null;
  }

  function renderChannel(ch: ChannelInfo) {
    const dmUserId = getDmUserId(ch);
    const dmUser = dmUserId ? users[dmUserId] : null;

    return (
      <button
        key={ch.id}
        className={`channel-item ${activeChannelId === ch.id ? "active" : ""} ${isUnread(ch) ? "unread" : ""} ${dragChannelId === ch.id ? "dragging" : ""}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          setDragChannelId(ch.id);
        }}
        onDragEnd={() => {
          setDragChannelId(null);
          setDragOverCategoryId(null);
        }}
        onClick={() => onSelectChannel(ch.id)}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            handleMiddleClick(ch.id);
          }
        }}
        onContextMenu={(e) => handleContextMenu(e, ch.id)}
      >
        {dmUserId ? (
          <span className="channel-prefix channel-dm-avatar">
            <UserAvatar
              userId={dmUserId}
              username={dmUser?.username || dmUserId}
              size={18}
            />
          </span>
        ) : (
          <span className="channel-prefix">{getPrefix(ch)}</span>
        )}
        <span className="channel-name">{getDisplayName(ch)}</span>
        {ch.mention_count > 0 && (
          <span className="mention-badge">{ch.mention_count}</span>
        )}
      </button>
    );
  }

  function renderCategoryHeader(cat: SidebarCategory) {
    const isCollapsed = collapsedCategories.has(cat.id);
    const isCustom = cat.category_type === "custom";
    const isRenaming = renamingCategoryId === cat.id;

    return (
      <div
        key={`header-${cat.id}`}
        className="channel-group-header"
        onContextMenu={(e) => handleCategoryContextMenu(e, cat.id)}
      >
        <button
          className="channel-group-collapse-btn"
          onClick={() => toggleCollapseCategory(cat.id)}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          <span className={`collapse-chevron ${isCollapsed ? "collapsed" : ""}`}>&#8250;</span>
        </button>

        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="category-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => handleRenameSubmit(cat.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit(cat.id);
              if (e.key === "Escape") setRenamingCategoryId(null);
            }}
          />
        ) : (
          <span className="channel-group-title">{getCategoryDisplayName(cat)}</span>
        )}

        <button
          className="category-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleCategoryContextMenu(e, cat.id);
          }}
          title="Category options"
        >
          &#8230;
        </button>

        {isCustom && categoryMenu?.categoryId === cat.id && (
          // Rendered outside, see below
          null
        )}
      </div>
    );
  }

  return (
    <nav
      className="channel-list"
      aria-label="Channels"
      onClick={() => {
        setContextMenu(null);
        setCategoryMenu(null);
      }}
    >
      <button
        className={`channel-item threads-nav-btn ${mainSubView === "threads" ? "active" : ""}`}
        onClick={handleThreadsClick}
      >
        <span className="channel-prefix">&#x1F4AC;</span>
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

      {useCategoryView ? (
        // Sidebar categories view
        <>
          {[...sidebarCategories]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((cat) => {
              const catChannels = cat.channel_ids
                .map((id) => channelMap.get(id))
                .filter((ch): ch is ChannelInfo => ch !== undefined);

              if (catChannels.length === 0) return null;

              const isCollapsed = collapsedCategories.has(cat.id);

              return (
                <div
                  key={cat.id}
                  className={`channel-group ${dragOverCategoryId === cat.id ? "drag-over" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverCategoryId(cat.id);
                  }}
                  onDragLeave={(e) => {
                    // Only clear if leaving the group entirely (not entering a child)
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverCategoryId(null);
                    }
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const channelId = dragChannelId;
                    setDragOverCategoryId(null);
                    setDragChannelId(null);
                    if (channelId) {
                      await handleMoveToCategory(channelId, cat.id);
                    }
                  }}
                >
                  {renderCategoryHeader(cat)}
                  {!isCollapsed && catChannels.map(renderChannel)}
                </div>
              );
            })}

          {/* New category creation input */}
          {creatingCategory ? (
            <div className="new-category-input-row">
              <input
                ref={newCategoryInputRef}
                className="category-rename-input"
                placeholder="Category name..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onBlur={handleCreateCategorySubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCategorySubmit();
                  if (e.key === "Escape") {
                    setCreatingCategory(false);
                    setNewCategoryName("");
                  }
                }}
              />
            </div>
          ) : (
            <button
              className="channel-item create-category-btn"
              onClick={(e) => {
                e.stopPropagation();
                setCreatingCategory(true);
              }}
            >
              <span className="channel-prefix">+</span>
              <span className="channel-name">New Category</span>
            </button>
          )}
        </>
      ) : (
        // Fallback static grouping
        <>
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
            getPrefix={() => "\uD83D\uDD12"}
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
        </>
      )}

      {/* Channel context menu */}
      {contextMenu && (
        <>
          <div
            className="context-menu-overlay"
            onClick={() => { setContextMenu(null); setShowMoveSubmenu(false); }}
          />
          <div
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
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

            {/* Move to category submenu — only show if categories are loaded */}
            {useCategoryView && (
              <>
                <div className="context-menu-divider" />
                <div
                  className="context-menu-item context-menu-submenu-trigger"
                  onMouseEnter={() => setShowMoveSubmenu(true)}
                  onMouseLeave={() => setShowMoveSubmenu(false)}
                >
                  <span>Move to Category</span>
                  <span className="submenu-arrow">&#8250;</span>
                  {showMoveSubmenu && (
                    <div className="context-menu context-submenu">
                      {customCategories.map((cat) => (
                        <button
                          key={cat.id}
                          className="context-menu-item"
                          onClick={() => handleMoveToCategory(contextMenu.channelId, cat.id)}
                        >
                          {cat.display_name}
                        </button>
                      ))}
                      {customCategories.length === 0 && (
                        <div className="context-menu-label">No custom categories</div>
                      )}
                      <div className="context-menu-divider" />
                      <button
                        className="context-menu-item"
                        onClick={() => handleMoveToCategory(contextMenu.channelId, null)}
                      >
                        Remove from category
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

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
            <div className="context-menu-divider" />
            <button
              className="context-menu-item"
              onClick={() => {
                setContextMenu(null);
                setCreatingCategory(true);
              }}
            >
              Create new category
            </button>
          </div>
        </>
      )}

      {/* Category context menu */}
      {categoryMenu && (
        <>
          <div
            className="context-menu-overlay"
            onClick={() => setCategoryMenu(null)}
          />
          <div
            className="context-menu"
            style={{ top: categoryMenu.y, left: categoryMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarCategories.find((c) => c.id === categoryMenu.categoryId)?.category_type === "custom" && (
              <>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    const cat = sidebarCategories.find((c) => c.id === categoryMenu.categoryId);
                    if (cat) handleStartRename(cat.id, cat.display_name);
                  }}
                >
                  Rename
                </button>
                <button
                  className="context-menu-item context-menu-item-danger"
                  onClick={() => handleDeleteCategory(categoryMenu.categoryId)}
                >
                  Delete
                </button>
                <div className="context-menu-divider" />
              </>
            )}
            <button
              className="context-menu-item"
              onClick={() => {
                setCategoryMenu(null);
                setCreatingCategory(true);
              }}
            >
              Create new category
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
