import { useRef, useCallback, useState, useEffect } from "react";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore, type ChannelInfo } from "@/stores/uiStore";
import { onDragOver, onDragEnd } from "@/hooks/useChannelDrag";

interface TabBarProps {
  onSelectChannel: (channelId: string) => void;
  currentUserId: string | null;
}

export function TabBar({ onSelectChannel, currentUserId }: TabBarProps) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const channels = useUiStore((s) => s.channels);
  const users = useUiStore((s) => s.users);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState(false);
  const [channelDragging, setChannelDragging] = useState(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const unOver = onDragOver((isDragging) => {
      isDraggingRef.current = isDragging;
      setChannelDragging(isDragging);
      if (!isDragging) setDropTarget(false);
    });

    function onMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current || !tabBarRef.current) return;
      const rect = tabBarRef.current.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      setDropTarget(inside);
    }
    window.addEventListener("mousemove", onMouseMove);
    const unEnd = onDragEnd((channelId, x, y) => {
      setChannelDragging(false);
      setDropTarget(false);
      const el = tabBarRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      if (inside) {
        const { tabs } = useTabsStore.getState();
        const alreadyOpen = tabs.find((t) => t.channelId === channelId);
        if (!alreadyOpen) {
          useTabsStore.getState().openNewTab(channelId);
        } else {
          useTabsStore.getState().setActiveTab(alreadyOpen.id);
        }
        onSelectChannel(channelId);
      }
    });
    return () => { unOver(); unEnd(); window.removeEventListener("mousemove", onMouseMove); };
  }, [onSelectChannel]);

  const getChannelDisplayName = useCallback(
    (channel: ChannelInfo | undefined, channelId: string): string => {
      if (!channel) return channelId.slice(0, 8);
      if (channel.channel_type === "D") {
        const parts = channel.name.split("__");
        for (const part of parts) {
          if (part === currentUserId) continue;
          const user = users[part];
          if (user) {
            return (
              user.nickname ||
              `${user.first_name} ${user.last_name}`.trim() ||
              user.username
            );
          }
        }
        return channel.display_name || "Direct Message";
      }
      if (channel.channel_type === "G") {
        const parts = channel.name.split("__");
        const names = parts
          .filter((p) => p !== currentUserId)
          .map((p) => {
            const user = users[p];
            if (!user) return null;
            return user.nickname || `${user.first_name} ${user.last_name}`.trim() || user.username;
          })
          .filter(Boolean);
        return names.length > 0 ? names.join(", ") : channel.display_name || "Group Message";
      }
      return channel.display_name;
    },
    [users, currentUserId],
  );

  const getChannelIcon = useCallback((channel: ChannelInfo | undefined): string => {
    if (!channel) return "#";
    if (channel.channel_type === "O") return "#";
    if (channel.channel_type === "P") return "🔒";
    if (channel.channel_type === "D") return "💬";
    if (channel.channel_type === "G") return "👥";
    return "#";
  }, []);

  function handleTabClick(tabId: string, channelId: string) {
    useTabsStore.getState().setActiveTab(tabId);
    useTabsStore.getState().clearTabUnread(tabId);
    onSelectChannel(channelId);
  }

  function handleCloseTab(e: React.MouseEvent, tabId: string) {
    e.stopPropagation();
    const store = useTabsStore.getState();
    const wasActive = store.activeTabId === tabId;
    store.closeTab(tabId);

    // If we closed the active tab, navigate to the new active tab's channel
    if (wasActive) {
      const newState = useTabsStore.getState();
      if (newState.activeTabId) {
        const newTab = newState.tabs.find((t) => t.id === newState.activeTabId);
        if (newTab) {
          onSelectChannel(newTab.channelId);
        }
      }
    }
  }

  function handleWheel(e: React.WheelEvent) {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }

  const isVisible = tabs.length > 0 || channelDragging;

  return (
    <div
      ref={tabBarRef}
      className={`tab-bar ${dropTarget ? "tab-bar-drop-target" : ""}`}
      style={!isVisible ? { height: 0, overflow: "hidden", border: "none" } : undefined}
      onWheel={handleWheel}
    >
      <div className="tab-bar-scroll" ref={scrollRef}>
        {tabs.map((tab) => {
          const channel = channels.find((ch) => ch.id === tab.channelId);
          const name = getChannelDisplayName(channel, tab.channelId);
          const icon = getChannelIcon(channel);
          const isActive = tab.id === activeTabId;

          return (
            <button
              key={tab.id}
              className={`tab-item ${isActive ? "active" : ""}`}
              onClick={() => handleTabClick(tab.id, tab.channelId)}
              title={name}
            >
              <span className="tab-icon">{icon}</span>
              <span className="tab-name">{name}</span>
              {tab.unreadCount > 0 && (
                <span className="tab-badge">{tab.unreadCount}</span>
              )}
              {tabs.length > 1 && !tab.isDefault && (
                <span
                  className="tab-close"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  title="Close tab"
                >
                  ×
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
