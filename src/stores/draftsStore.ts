import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

export interface DraftData {
  message: string;
  channelId: string;
  rootId: string; // "" for channel drafts, post ID for thread drafts
  updateAt: number;
}

interface DraftsState {
  drafts: Record<string, DraftData>; // key: `channel:{channelId}` or `thread:{rootId}`
  serverId: string | null;

  setServerId: (id: string | null) => void;
  setDraft: (channelId: string, rootId: string, message: string) => void;
  clearDraft: (channelId: string, rootId: string) => void;
  getDraft: (channelId: string, rootId: string) => DraftData | undefined;
  loadFromServer: (serverId: string) => Promise<void>;
}

function draftKey(channelId: string, rootId: string): string {
  return rootId ? `thread:${rootId}` : `channel:${channelId}`;
}

// Debounce timers per draft key
const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function scheduleSyncToServer(serverId: string, channelId: string, rootId: string, message: string) {
  const key = draftKey(channelId, rootId);
  if (syncTimers[key]) clearTimeout(syncTimers[key]);

  syncTimers[key] = setTimeout(async () => {
    delete syncTimers[key];
    try {
      if (message.trim()) {
        await invoke("upsert_draft", { serverId, channelId, rootId, message });
      } else {
        await invoke("delete_draft", { serverId, channelId, rootId }).catch(() => {});
      }
    } catch {
      // Server sync is best-effort; local draft is always authoritative
    }
  }, 1500);
}

function cancelSyncTimer(channelId: string, rootId: string) {
  const key = draftKey(channelId, rootId);
  if (syncTimers[key]) {
    clearTimeout(syncTimers[key]);
    delete syncTimers[key];
  }
}

export const useDraftsStore = create<DraftsState>()(
  persist(
    (set, get) => ({
      drafts: {},
      serverId: null,

      setServerId: (serverId) => set({ serverId }),

      setDraft: (channelId, rootId, message) => {
        const key = draftKey(channelId, rootId);
        const { serverId } = get();

        if (!message.trim()) {
          set((state) => {
            const next = { ...state.drafts };
            delete next[key];
            return { drafts: next };
          });
          // Cancel any pending upsert and delete from server
          cancelSyncTimer(channelId, rootId);
          if (serverId) {
            invoke("delete_draft", { serverId, channelId, rootId }).catch(() => {});
          }
          return;
        }

        set((state) => ({
          drafts: {
            ...state.drafts,
            [key]: { message, channelId, rootId, updateAt: Date.now() },
          },
        }));

        if (serverId) {
          scheduleSyncToServer(serverId, channelId, rootId, message);
        }
      },

      clearDraft: (channelId, rootId) => {
        const key = draftKey(channelId, rootId);
        const { serverId } = get();

        cancelSyncTimer(channelId, rootId);

        set((state) => {
          const next = { ...state.drafts };
          delete next[key];
          return { drafts: next };
        });

        if (serverId) {
          invoke("delete_draft", { serverId, channelId, rootId }).catch(() => {});
        }
      },

      getDraft: (channelId, rootId) => {
        const key = draftKey(channelId, rootId);
        return get().drafts[key];
      },

      loadFromServer: async (serverId) => {
        try {
          const serverDrafts = await invoke<Array<{
            channel_id: string;
            root_id: string;
            message: string;
            update_at: number;
          }>>("get_drafts", { serverId });

          const localDrafts = get().drafts;
          const merged: Record<string, DraftData> = { ...localDrafts };

          for (const d of serverDrafts) {
            if (!d.message.trim()) continue;
            const key = draftKey(d.channel_id, d.root_id);
            const local = merged[key];
            // Server wins only if it's newer than local
            if (!local || d.update_at > local.updateAt) {
              merged[key] = {
                message: d.message,
                channelId: d.channel_id,
                rootId: d.root_id,
                updateAt: d.update_at,
              };
            }
          }

          set({ drafts: merged, serverId });
        } catch {
          // Server may not support drafts API (older version) — silently ignore
          set({ serverId });
        }
      },
    }),
    {
      name: "mattermost-drafts",
      partialize: (state) => ({ drafts: state.drafts }),
    }
  )
);
