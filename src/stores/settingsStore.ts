import { create } from "zustand";

export interface AppSettings {
  theme: "dark" | "light";
  timeFormat: "12h" | "24h";
  compactMode: boolean;
  sendOnEnter: boolean;
  showTimestamps: boolean;
  notificationsEnabled: boolean;
  developerMode: boolean;
}

const DEFAULTS: AppSettings = {
  theme: "dark",
  timeFormat: "24h",
  compactMode: false,
  sendOnEnter: true,
  showTimestamps: true,
  notificationsEnabled: true,
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
        developerMode: next.developerMode,
      });
      return { [key]: value };
    }),

  resetSettings: () => {
    saveSettings(DEFAULTS);
    set(DEFAULTS);
  },
}));
