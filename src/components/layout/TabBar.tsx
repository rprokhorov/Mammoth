import { useRef, useCallback } from "react";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore, type ChannelInfo } from "@/stores/uiStore";

interface TabBarProps {
  onSelectChannel: (channelId: string) => void;
}

export function TabBar({ onSelectChannel }: TabBarProps) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const channels = useUiStore((s) => s.channels);
  const users = useUiStore((s) => s.users);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getChannelDisplayName = useCallback(
    (channel: ChannelInfo | undefined, channelId: string): string => {
      if (!channel) return channelId.slice(0, 8);
      if (channel.channel_type === "D") {
        const parts = channel.name.split("__");
        for (const part of parts) {
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
      return channel.display_name;
    },
    [users],
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

  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar" onWheel={handleWheel}>
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
