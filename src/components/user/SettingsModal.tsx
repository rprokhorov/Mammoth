import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore, type AppSettings } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const settings = useSettingsStore();
  const activeServerId = useUiStore((s) => s.activeServerId);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!activeServerId) return;
    invoke<string>("get_server_version", { serverId: activeServerId })
      .then(setServerVersion)
      .catch(() => setServerVersion(null));
  }, [activeServerId]);

  function toggle<K extends keyof AppSettings>(key: K) {
    settings.updateSetting(key, !settings[key] as AppSettings[K]);
  }

  async function handleClearCache() {
    setClearing(true);
    setClearMsg(null);
    try {
      await invoke("clear_app_cache");
      setClearMsg("Cache cleared. Reload the app to apply.");
    } catch {
      setClearMsg("Failed to clear cache.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="settings-sections">
          {/* Display */}
          <div className="settings-section">
            <h3>Display</h3>

            <div className="settings-row">
              <div className="settings-label">
                <span>Theme</span>
              </div>
              <select
                className="settings-select"
                value={settings.theme}
                onChange={(e) =>
                  settings.updateSetting("theme", e.target.value as "dark" | "light")
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>

            <div className="settings-row">
              <div className="settings-label">
                <span>Time Format</span>
              </div>
              <select
                className="settings-select"
                value={settings.timeFormat}
                onChange={(e) =>
                  settings.updateSetting("timeFormat", e.target.value as "12h" | "24h")
                }
              >
                <option value="24h">24-hour</option>
                <option value="12h">12-hour</option>
              </select>
            </div>

            <div className="settings-row">
              <div className="settings-label">
                <span>Compact Mode</span>
                <span className="settings-desc">Reduce spacing between messages</span>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.compactMode}
                  onChange={() => toggle("compactMode")}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-label">
                <span>Show Timestamps</span>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.showTimestamps}
                  onChange={() => toggle("showTimestamps")}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* Messages */}
          <div className="settings-section">
            <h3>Messages</h3>

            <div className="settings-row">
              <div className="settings-label">
                <span>Send on Enter</span>
                <span className="settings-desc">
                  Press Enter to send, Shift+Enter for new line
                </span>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.sendOnEnter}
                  onChange={() => toggle("sendOnEnter")}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* Notifications */}
          <div className="settings-section">
            <h3>Notifications</h3>

            <div className="settings-row">
              <div className="settings-label">
                <span>Desktop Notifications</span>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.notificationsEnabled}
                  onChange={() => toggle("notificationsEnabled")}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* Advanced */}
          <div className="settings-section">
            <h3>Advanced</h3>

            <div className="settings-row">
              <div className="settings-label">
                <span>Developer Mode</span>
                <span className="settings-desc">Show debug info and performance stats</span>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.developerMode}
                  onChange={() => toggle("developerMode")}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-label">
                <span>Clear Cache</span>
                <span className="settings-desc">Remove cached images and temp files</span>
              </div>
              <button
                className="btn btn-secondary"
                onClick={handleClearCache}
                disabled={clearing}
              >
                {clearing ? "Clearing…" : "Clear Cache"}
              </button>
            </div>
            {clearMsg && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
                {clearMsg}
              </p>
            )}
          </div>

          {/* About */}
          <div className="settings-section">
            <h3>About</h3>
            <div className="settings-row">
              <div className="settings-label">
                <span>App Version</span>
              </div>
              <span className="settings-value-text">0.1.0</span>
            </div>
            {serverVersion && (
              <div className="settings-row">
                <div className="settings-label">
                  <span>Server Version</span>
                </div>
                <span className="settings-value-text">{serverVersion}</span>
              </div>
            )}
          </div>

          {/* Reset */}
          <div className="settings-section">
            <button
              className="btn btn-secondary"
              onClick={settings.resetSettings}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
