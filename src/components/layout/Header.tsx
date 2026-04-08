import { useState, useRef } from "react";
import iconInfo from "@/assets/icon-info.png";
import { useUiStore } from "@/stores/uiStore";
import { PresenceDot } from "@/components/message/PresenceDot";
import { UserAvatar } from "@/components/common/UserAvatar";
import { StatusPicker } from "@/components/user/StatusPicker";

interface HeaderProps {
  onTeamChange: (teamId: string) => void;
  serverId: string | null;
  currentUserId: string | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  showChannelInfo: boolean;
  onToggleChannelInfo: () => void;
}

export function Header({
  onTeamChange,
  serverId,
  currentUserId,
  onOpenProfile,
  onOpenSettings,
  onOpenShortcuts,
  showChannelInfo,
  onToggleChannelInfo,
}: HeaderProps) {
  const teams = useUiStore((s) => s.teams);
  const activeTeamId = useUiStore((s) => s.activeTeamId);
  const channels = useUiStore((s) => s.channels);
  const activeChannelId = useUiStore((s) => s.activeChannelId);
  const wsStatus = useUiStore((s) => s.wsStatus);
  const servers = useUiStore((s) => s.servers);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find((ch) => ch.id === activeChannelId);
  const activeServer = servers.find(
    (s) => s.id === (serverId ?? useUiStore.getState().activeServerId),
  );

  return (
    <header className="app-header">
      <div className="header-left">
        {teams.length > 1 && (
          <select
            className="team-selector"
            value={activeTeamId || ""}
            onChange={(e) => onTeamChange(e.target.value)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.display_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="header-center">
        {activeChannel && (
          <div className="channel-header-info">
            <span className="channel-header-name">
              {activeChannel.channel_type === "O" && "# "}
              {activeChannel.display_name}
            </span>
          </div>
        )}
      </div>

      <div className="header-right" ref={menuRef}>
        {activeChannel && (
          <button
            className={`header-icon-btn${showChannelInfo ? " active" : ""}`}
            onClick={onToggleChannelInfo}
            title="Channel Info"
          >
            <img src={iconInfo} width="20" height="20" alt="Channel Info" />
          </button>
        )}

        <span
          className={`ws-indicator ${wsStatus}`}
          title={`WebSocket: ${wsStatus}`}
        />

        <button
          className="header-user-btn"
          onClick={() => setShowUserMenu((v) => !v)}
          title={activeServer?.username || "User menu"}
        >
          {currentUserId
            ? <UserAvatar userId={currentUserId} username={activeServer?.username || "?"} size={32} />
            : <span className="header-user-avatar">{(activeServer?.username || "?").charAt(0).toUpperCase()}</span>
          }
          {currentUserId && <PresenceDot userId={currentUserId} />}
        </button>

        {showUserMenu && (
          <div className="header-user-menu">
            <div className="user-menu-header">
              <span className="user-menu-username">
                {activeServer?.username}
              </span>
            </div>
            <button
              className="user-menu-item"
              onClick={() => {
                setShowStatusPicker(true);
                setShowUserMenu(false);
              }}
            >
              Set Status
            </button>
            <button
              className="user-menu-item"
              onClick={() => {
                onOpenProfile();
                setShowUserMenu(false);
              }}
            >
              Edit Profile
            </button>
            <button
              className="user-menu-item"
              onClick={() => {
                onOpenSettings();
                setShowUserMenu(false);
              }}
            >
              Settings
            </button>
            <button
              className="user-menu-item"
              onClick={() => {
                onOpenShortcuts();
                setShowUserMenu(false);
              }}
            >
              Keyboard Shortcuts
            </button>
          </div>
        )}

        {showStatusPicker && serverId && currentUserId && (
          <div className="header-status-picker-wrapper">
            <StatusPicker
              serverId={serverId}
              currentUserId={currentUserId}
              onClose={() => setShowStatusPicker(false)}
            />
          </div>
        )}
      </div>
    </header>
  );
}
