import { create } from "zustand";

export interface AppSettings {
  theme: "dark" | "light";
  timeFormat: "12h" | "24h";
  compactMode: boolean;
  sendOnEnter: boolean;
  showTimestamps: boolean;
  notificationsEnabled: boolean;
  /** Show muted DMs and group chats in the unread filter when they have unread messages. */
  unreadFilterIncludesMutedDms: boolean;
  developerMode: boolean;
}

const DEFAULTS: AppSettings = {
  theme: "dark",
  timeFormat: "24h",
  compactMode: false,
  sendOnEnter: true,
  showTimestamps: true,
  notificationsEnabled: true,
  unreadFilterIncludesMutedDms: true,
  developerMode: false,
};

const STORAGE_KEY = "mm-desktop-settings";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return DEFAULTS;
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable or full (private mode, blocked site data).
    // Losing persistence is acceptable; throwing out of a setter is not.
  }
}

interface SettingsState extends AppSettings {
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...loadSettings(),

  updateSetting: (key, value) =>
    set((state) => {
      const next = { ...state, [key]: value };
      saveSettings({
        theme: next.theme,
        timeFormat: next.timeFormat,
        compactMode: next.compactMode,
        sendOnEnter: next.sendOnEnter,
        showTimestamps: next.showTimestamps,
        notificationsEnabled: next.notificationsEnabled,
        unreadFilterIncludesMutedDms: next.unreadFilterIncludesMutedDms,
        developerMode: next.developerMode,
      });
      return { [key]: value };
    }),

  resetSettings: () => {
    saveSettings(DEFAULTS);
    set(DEFAULTS);
  },
}));
