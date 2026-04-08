import { useEffect, useState, useRef, useCallback, Component, type ReactNode, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore, type SidebarCategory } from "@/stores/uiStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { ServerSidebar } from "@/components/layout/ServerSidebar";
import { ChannelList } from "@/components/layout/ChannelList";
import { Header } from "@/components/layout/Header";
import { ServerUrlInput } from "@/components/auth/ServerUrlInput";
import { LoginForm } from "@/components/auth/LoginForm";
import { MessageList } from "@/components/message/MessageList";
import { MessageComposer } from "@/components/message/MessageComposer";
import { ThreadPanel } from "@/components/message/ThreadPanel";
import { TypingIndicator } from "@/components/message/TypingIndicator";
import { ThreadsView } from "@/components/message/ThreadsView";
import { useThreadsStore, type UserThread } from "@/stores/threadsStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useCustomEmojiStore, type CustomEmoji } from "@/stores/customEmojiStore";
import { SearchBar } from "@/components/search/SearchBar";
import { TabBar } from "@/components/layout/TabBar";
import { ChannelInfoPanel } from "@/components/channel/ChannelInfoPanel";

// Lazy-load heavy modals
const ProfileModal = lazy(() => import("@/components/user/ProfileModal").then(m => ({ default: m.ProfileModal })));
const SettingsModal = lazy(() => import("@/components/user/SettingsModal").then(m => ({ default: m.SettingsModal })));
const ShortcutsModal = lazy(() => import("@/components/user/ShortcutsModal").then(m => ({ default: m.ShortcutsModal })));
const CreateChannelModal = lazy(() => import("@/components/channel/CreateChannelModal").then(m => ({ default: m.CreateChannelModal })));

// Error boundary to catch and display React errors instead of blank screen
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; clearing: boolean }
> {
  state = { error: null as Error | null, clearing: false };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  async handleClearAndReload() {
    this.setState({ clearing: true });
    try {
      await invoke("clear_app_cache");
    } catch { /* ignore */ }
    window.location.reload();
  }
  render() {
    if (this.state.error) {
      return (
        <div className="error-screen">
          <div className="error-screen-icon">⚠️</div>
          <h2 className="error-screen-title">Something went wrong</h2>
          <pre className="error-screen-message">
            {this.state.error.message}
          </pre>
          <div className="error-screen-actions">
            <button
              className="btn btn-primary"
              onClick={() => this.setState({ error: null })}
            >
              Try Again
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => this.handleClearAndReload()}
              disabled={this.state.clearing}
            >
              {this.state.clearing ? "Clearing…" : "Clear Cache & Reload"}
            </button>
          </div>
          <details style={{ marginTop: 16, opacity: 0.5 }}>
            <summary style={{ cursor: "pointer", fontSize: 12 }}>Stack trace</summary>
            <pre className="error-screen-stack">{this.state.error.stack}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ServerInfo {
  id: string;
  display_name: string;
  url: string;
  connected: boolean;
  username?: string;
}

function AppContent() {
  // Use individual selectors to avoid re-rendering on every store change
  const servers = useUiStore((s) => s.servers);
  const activeServerId = useUiStore((s) => s.activeServerId);
  const currentView = useUiStore((s) => s.currentView);
  const activeChannelId = useUiStore((s) => s.activeChannelId);
  const activeTeamId = useUiStore((s) => s.activeTeamId);
  const channels = useUiStore((s) => s.channels);
  const mainSubView = useUiStore((s) => s.mainSubView);

  const activeThreadId = useThreadsStore((s) => s.activeThreadId);

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showChannelInfo, setShowChannelInfo] = useState(false);

  // Resizable panel widths
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [threadWidth, setThreadWidth] = useState(400);
  const dragging = useRef<{ type: "sidebar" | "thread"; startX: number; startW: number } | null>(null);

  const handleResizeMouseDown = useCallback((type: "sidebar" | "thread", e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = {
      type,
      startX: e.clientX,
      startW: type === "sidebar" ? sidebarWidth : threadWidth,
    };

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const delta = ev.clientX - dragging.current.startX;
      if (dragging.current.type === "sidebar") {
        setSidebarWidth(Math.max(160, Math.min(480, dragging.current.startW + delta)));
      } else {
        setThreadWidth(Math.max(240, Math.min(640, dragging.current.startW - delta)));
      }
    }
    function onUp() {
      dragging.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth, threadWidth]);

  useWebSocket();

  useEffect(() => {
    loadServers();
  }, []);

  // Intercept all link clicks and open in system browser
  useEffect(() => {
    function handleLinkClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      e.preventDefault();
      invoke("open_url", { url: href }).catch(console.error);
    }
    document.addEventListener("click", handleLinkClick);
    return () => document.removeEventListener("click", handleLinkClick);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShowShortcutsModal((v) => !v);
      }
      // Cmd/Ctrl+Shift+T — toggle Threads view
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "T") {
        e.preventDefault();
        const store = useUiStore.getState();
        if (store.currentView === "main") {
          const newView = store.mainSubView === "threads" ? "channels" : "threads";
          if (newView === "threads") {
            store.setActiveChannelId(null);
          }
          store.setMainSubView(newView);
        }
      }
      // Cmd/Ctrl+T — open current channel in a new tab (always creates new)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "t") {
        e.preventDefault();
        const channelId = useUiStore.getState().activeChannelId;
        if (channelId) {
          useTabsStore.getState().openNewTab(channelId);
        }
      }
      // Cmd/Ctrl+W — close active tab (default tab cannot be closed)
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        const tabStore = useTabsStore.getState();
        const activeTab = tabStore.tabs.find((t) => t.id === tabStore.activeTabId);
        if (tabStore.activeTabId && tabStore.tabs.length > 1 && !activeTab?.isDefault) {
          const closingId = tabStore.activeTabId;
          tabStore.closeTab(closingId);
          // Navigate to the new active tab's channel
          const newState = useTabsStore.getState();
          if (newState.activeTabId) {
            const newTab = newState.tabs.find((t) => t.id === newState.activeTabId);
            if (newTab) {
              const uiStore = useUiStore.getState();
              uiStore.setActiveChannelId(newTab.channelId);
              uiStore.setMainSubView("channels");
              uiStore.updateChannelMentions(newTab.channelId, 0, 0);
            }
          }
        }
      }
      // Cmd/Ctrl+1-9 — switch to nth tab
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        const tabStore = useTabsStore.getState();
        const tab = tabStore.tabs[idx];
        if (tab) {
          tabStore.setActiveTab(tab.id);
          tabStore.clearTabUnread(tab.id);
          const uiStore = useUiStore.getState();
          uiStore.setActiveChannelId(tab.channelId);
          uiStore.setMainSubView("channels");
          uiStore.updateChannelMentions(tab.channelId, 0, 0);
          if (uiStore.activeServerId) {
            invoke("view_channel", {
              serverId: uiStore.activeServerId,
              channelId: tab.channelId,
            }).catch(() => {});
          }
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function loadServers() {
    const store = useUiStore.getState();
    try {
      const serverList = await invoke<ServerInfo[]>("list_servers");
      const mapped = serverList.map((s) => ({
        id: s.id,
        displayName: s.display_name,
        url: s.url,
        connected: s.connected,
        username: s.username,
      }));
      store.setServers(mapped);

      if (mapped.length === 0) {
        store.setCurrentView("add-server");
        return;
      }

      const activeId = await invoke<string | null>("get_active_server");
      const targetId = activeId && mapped.some((s) => s.id === activeId)
        ? activeId
        : mapped[0].id;
      store.setActiveServerId(targetId);

      // Try to validate saved session
      try {
        let valid: boolean;
        try {
          valid = await invoke<boolean>("validate_session", { serverId: targetId });
        } catch (e) {
          const msg = String(e).toLowerCase();
          const isNetwork = msg.includes("network") || msg.includes("connection") || msg.includes("timeout") || msg.includes("connect");
          if (isNetwork) {
            // Server unreachable — keep token, go to main with offline indicator
            console.warn("Server unreachable at startup, proceeding offline:", e);
            store.setCurrentView("main");
            return;
          }
          throw e;
        }
        if (!valid) {
          store.setCurrentView("login");
          return;
        }

        // Session is valid — load user, connect WS, load data
        const me = await invoke<{ id: string; username: string }>("get_me", { serverId: targetId });
        setCurrentUserId(me.id);
        store.setCurrentUserId(me.id);
        store.setServers(mapped.map((s) =>
          s.id === targetId ? { ...s, connected: true, username: me.username } : s,
        ));

        // Connect WebSocket (fire and forget)
        invoke("connect_ws", { serverId: targetId }).catch((e: unknown) =>
          console.error("WS connect failed:", e),
        );

        // Load teams & channels
        await loadTeams(targetId);
        // Load user threads so unread badge works immediately
        const teamIdAfterLoad = useUiStore.getState().activeTeamId;
        if (teamIdAfterLoad) {
          loadUserThreads(targetId, teamIdAfterLoad).catch(() => {});
        }
        // Load custom emojis in background
        loadCustomEmojis(targetId).catch(() => {});
        store.setCurrentView("main");
      } catch (e) {
        console.error("Session restore failed:", e);
        const msg = String(e).toLowerCase();
        const isNetwork = msg.includes("network") || msg.includes("connection") || msg.includes("timeout") || msg.includes("connect") || msg.includes("os error");
        if (isNetwork) {
          console.warn("Network error during session restore, proceeding offline");
          store.setCurrentView("main");
        } else {
          setInitError(String(e));
          store.setCurrentView("login");
        }
      }
    } catch (e) {
      console.error("Failed to load servers:", e);
      setInitError(String(e));
      store.setCurrentView("add-server");
    } finally {
      setLoading(false);
    }
  }

  function handleServerAdded(serverId: string, _serverUrl: string) {
    loadServers().then(() => {
      const store = useUiStore.getState();
      store.setActiveServerId(serverId);
      store.setCurrentView("login");
    });
  }

  async function handleLoginSuccess(userId: string, username: string) {
    const store = useUiStore.getState();
    const serverId = store.activeServerId;
    if (!serverId) return;

    setCurrentUserId(userId);
    store.setCurrentUserId(userId);
    store.updateServer(serverId, { connected: true, username });

    // Connect WebSocket
    try {
      await invoke("connect_ws", { serverId });
    } catch (e) {
      console.error("WS connect failed:", e);
    }

    // Load teams
    await loadTeams(serverId);

    // Load user threads so unread badge works immediately
    const teamIdAfterLoad = useUiStore.getState().activeTeamId;
    if (teamIdAfterLoad) {
      loadUserThreads(serverId, teamIdAfterLoad).catch(() => {});
    }

    // Load custom emojis in background
    loadCustomEmojis(serverId).catch(() => {});

    store.setCurrentView("main");
  }

  async function loadCustomEmojis(serverId: string, force = false) {
    if (!force && useCustomEmojiStore.getState().isFresh()) return;
    try {
      const list = await invoke<CustomEmoji[]>("get_custom_emojis", { serverId });
      useCustomEmojiStore.getState().setEmojis(list);
    } catch (e) {
      console.error("Failed to load custom emojis:", e);
    }
  }

  async function loadTeams(serverId: string) {
    const store = useUiStore.getState();
    try {
      const teams = await invoke<
        Array<{ id: string; display_name: string; name: string }>
      >("get_teams", { serverId });

      store.setTeams(teams);

      if (teams.length > 0) {
        const teamId = teams[0].id;
        store.setActiveTeamId(teamId);
        await loadChannels(serverId, teamId);
      }
    } catch (e) {
      console.error("Failed to load teams:", e);
    }
  }

  async function loadChannels(serverId: string, teamId: string) {
    const store = useUiStore.getState();
    try {
      const channelData = await invoke<
        Array<{
          id: string;
          team_id: string;
          display_name: string;
          name: string;
          channel_type: string;
          header: string;
          purpose: string;
          last_post_at: number;
          total_msg_count: number;
          msg_count: number;
          mention_count: number;
          last_viewed_at: number;
        }>
      >("get_channels_for_team", { serverId, teamId });

      store.setChannels(channelData);

      // Load DM user info
      const dmUserIds: string[] = [];
      for (const ch of channelData) {
        if (ch.channel_type === "D") {
          const parts = ch.name.split("__");
          dmUserIds.push(...parts);
        }
      }
      if (dmUserIds.length > 0) {
        const uniqueIds = [...new Set(dmUserIds)];
        try {
          const users = await invoke<
            Array<{
              id: string;
              username: string;
              first_name: string;
              last_name: string;
              nickname: string;
              email: string;
            }>
          >("get_users_by_ids", { serverId, userIds: uniqueIds });
          store.setUsers(users);
        } catch (e) {
          console.error("Failed to load users:", e);
        }
      }

      // Load favorites
      try {
        const favIds = await invoke<string[]>("get_favorite_channels", { serverId });
        store.setFavoriteChannels(favIds);
      } catch {
        // favorites not critical
      }

      // Load sidebar categories
      try {
        const categories = await invoke<SidebarCategory[]>("get_sidebar_categories", { serverId, teamId });
        useUiStore.getState().setSidebarCategories(categories);
      } catch {
        // sidebar categories not critical
      }

      // Select first public channel by default and set it as the default tab
      const firstPublic = channelData.find((ch) => ch.channel_type === "O");
      if (firstPublic) {
        store.setActiveChannelId(firstPublic.id);
        useTabsStore.getState().navigateDefaultTab(firstPublic.id);
      }
    } catch (e) {
      console.error("Failed to load channels:", e);
    }
  }

  async function loadUserThreads(serverId: string, teamId: string) {
    try {
      const res = await invoke<{
        threads: UserThread[];
        total: number;
        total_unread_threads: number;
        total_unread_mentions: number;
      }>("get_user_threads", {
        serverId,
        teamId,
        page: 0,
        perPage: 50,
      });
      useThreadsStore.getState().setUserThreads(
        res.threads ?? [],
        res.total,
        res.total_unread_threads,
      );
    } catch (e) {
      console.error("Failed to load user threads:", e);
    }
  }

  async function handleTeamChange(teamId: string) {
    const store = useUiStore.getState();
    store.setActiveTeamId(teamId);
    store.setActiveChannelId(null);
    store.setSidebarCategories([]);
    const serverId = store.activeServerId;
    if (serverId) {
      await loadChannels(serverId, teamId);
      loadUserThreads(serverId, teamId).catch(() => {});
    }
  }

  function handleSelectChannel(channelId: string) {
    const store = useUiStore.getState();
    store.setActiveChannelId(channelId);
    store.setMainSubView("channels");
    // Navigate default tab to this channel (don't create a new tab)
    const tabStore = useTabsStore.getState();
    tabStore.navigateDefaultTab(channelId);
    tabStore.clearTabUnread(channelId);
    // Clear unread badge immediately on the client side
    store.updateChannelMentions(channelId, 0, 0);
    // Also update badge count
    const totalMentions = store.channels.reduce(
      (sum, ch) => sum + (ch.id === channelId ? 0 : ch.mention_count),
      0,
    );
    invoke("set_badge_count", { count: totalMentions }).catch(() => {});
    // Mark channel as viewed on the server
    const serverId = store.activeServerId;
    if (serverId) {
      invoke("view_channel", {
        serverId,
        channelId,
      }).catch(console.error);
    }
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-logo">M</div>
        <div className="spinner" />
        <p className="app-loading-text">
          {initError ? initError : "Connecting…"}
        </p>
        {initError && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button className="btn btn-secondary" onClick={async () => {
              await invoke("clear_app_cache").catch(() => {});
              window.location.reload();
            }}>
              Clear Cache & Reload
            </button>
          </div>
        )}
      </div>
    );
  }

  const activeServer = servers.find((s) => s.id === activeServerId);
  const activeChannel = channels.find((ch) => ch.id === activeChannelId);

  return (
    <div className="app-layout">
      {servers.length > 0 && <ServerSidebar />}

      <div className="app-content">
        {currentView === "add-server" && (
          <div className="centered-content">
            <ServerUrlInput onServerAdded={handleServerAdded} />
          </div>
        )}

        {currentView === "login" && activeServerId && activeServer && (
          <div className="centered-content">
            <LoginForm
              serverId={activeServerId}
              serverUrl={activeServer.url}
              onLoginSuccess={handleLoginSuccess}
              onBack={() => useUiStore.getState().setCurrentView("add-server")}
            />
          </div>
        )}

        {currentView === "main" && activeServer && (
          <div className="main-view">
            {activeServerId && activeTeamId && (
              <SearchBar serverId={activeServerId} teamId={activeTeamId} />
            )}
            <div className="channel-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
              <ChannelList
                onSelectChannel={handleSelectChannel}
                onCreateChannel={() => setShowCreateChannel(true)}
                serverId={activeServerId}
                currentUserId={currentUserId}
                teamId={activeTeamId}
              />
            </div>
            <div className="resize-handle" onMouseDown={(e) => handleResizeMouseDown("sidebar", e)} />
            <div className="main-panel">
              <Header
                onTeamChange={handleTeamChange}
                serverId={activeServerId}
                currentUserId={currentUserId}
                onOpenProfile={() => setShowProfileModal(true)}
                onOpenSettings={() => setShowSettingsModal(true)}
                onOpenShortcuts={() => setShowShortcutsModal(true)}
                showChannelInfo={showChannelInfo}
                onToggleChannelInfo={() => setShowChannelInfo((v) => !v)}
              />
              <TabBar onSelectChannel={handleSelectChannel} currentUserId={currentUserId} />
              <div className="message-area">
                {mainSubView === "threads" && activeServerId && activeTeamId ? (
                  <ThreadsView serverId={activeServerId} teamId={activeTeamId} />
                ) : activeChannel && activeServerId ? (
                  <>
                    <MessageList
                      channelId={activeChannel.id}
                      serverId={activeServerId}
                      currentUserId={currentUserId}
                      onEditPost={(postId) =>
                        useMessagesStore.getState().setEditingPostId(postId)
                      }
                    />
                    <TypingIndicator channelId={activeChannel.id} />
                    <MessageComposer
                      channelId={activeChannel.id}
                      serverId={activeServerId}
                    />
                  </>
                ) : (
                  <div className="message-placeholder">
                    <p className="muted">Select a channel to start</p>
                  </div>
                )}
              </div>
            </div>
            {activeThreadId && activeServerId && (
              <>
                <div className="resize-handle" onMouseDown={(e) => handleResizeMouseDown("thread", e)} />
                <ThreadPanel
                  serverId={activeServerId}
                  currentUserId={currentUserId}
                  width={threadWidth}
                />
              </>
            )}
            {showChannelInfo && activeServerId && (
              <>
                <div className="resize-handle" onMouseDown={(e) => handleResizeMouseDown("thread", e)} />
                <ChannelInfoPanel
                  serverId={activeServerId}
                  onClose={() => setShowChannelInfo(false)}
                  onOpenNotificationPrefs={() => {}}
                  width={threadWidth}
                />
              </>
            )}
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        {showProfileModal && activeServerId && currentUserId && (
          <ProfileModal
            serverId={activeServerId}
            userId={currentUserId}
            onClose={() => setShowProfileModal(false)}
          />
        )}
        {showSettingsModal && (
          <SettingsModal onClose={() => setShowSettingsModal(false)} />
        )}
        {showShortcutsModal && (
          <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />
        )}
        {showCreateChannel && activeServerId && activeTeamId && (
          <CreateChannelModal
            serverId={activeServerId}
            teamId={activeTeamId}
            onClose={() => setShowCreateChannel(false)}
            onCreated={(channelId) => {
              if (activeServerId && activeTeamId) {
                loadChannels(activeServerId, activeTeamId).then(() => {
                  handleSelectChannel(channelId);
                });
              }
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
