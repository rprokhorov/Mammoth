import { useEffect } from "react";
import { useSettingsStore, type AppSettings } from "@/stores/settingsStore";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const settings = useSettingsStore();

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function toggle<K extends keyof AppSettings>(key: K) {
    settings.updateSetting(key, !settings[key] as AppSettings[K]);
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
