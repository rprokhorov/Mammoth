import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";

// In-memory cache: serverId+userId → data URL
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
// Listeners to notify components when a new avatar is loaded
const listeners = new Map<string, Set<(url: string) => void>>();

function subscribe(key: string, cb: (url: string) => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  return () => listeners.get(key)?.delete(cb);
}

function notify(key: string, url: string) {
  listeners.get(key)?.forEach((cb) => cb(url));
}

export function clearUserAvatarCache(serverId: string, userId: string) {
  const key = `${serverId}:${userId}`;
  cache.delete(key);
  pending.delete(key);
}

export function useUserAvatar(userId: string | null): string | null {
  const serverId = useUiStore((s) => s.activeServerId);
  const cacheKey = serverId && userId ? `${serverId}:${userId}` : null;

  const [url, setUrl] = useState<string | null>(() =>
    cacheKey ? (cache.get(cacheKey) ?? null) : null
  );

  useEffect(() => {
    if (!userId || !serverId || !cacheKey) return;

    // Always sync from cache on mount/key change
    const cached = cache.get(cacheKey);
    if (cached) {
      setUrl(cached);
      return;
    }

    // Subscribe to be notified when this avatar loads
    const unsub = subscribe(cacheKey, (u) => setUrl(u));

    if (!pending.has(cacheKey)) {
      const p = invoke<{ data_url: string }>("get_user_avatar", { serverId, userId })
        .then((r) => {
          cache.set(cacheKey, r.data_url);
          pending.delete(cacheKey);
          notify(cacheKey, r.data_url);
          return r.data_url;
        })
        .catch(() => {
          pending.delete(cacheKey);
          return "";
        });
      pending.set(cacheKey, p);
    }

    return unsub;
  }, [userId, serverId, cacheKey]);

  return url;
}
