import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";

// In-memory cache: serverId+userId → data URL
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export function clearUserAvatarCache(serverId: string, userId: string) {
  const key = `${serverId}:${userId}`;
  cache.delete(key);
  pending.delete(key);
}

export function useUserAvatar(userId: string | null): string | null {
  const serverId = useUiStore((s) => s.activeServerId);
  const cacheKey = serverId && userId ? `${serverId}:${userId}` : null;
  const cached = cacheKey ? (cache.get(cacheKey) ?? null) : null;
  const [url, setUrl] = useState<string | null>(cached);

  useEffect(() => {
    if (!userId || !serverId || !cacheKey) return;
    if (cached) { setUrl(cached); return; }

    if (!pending.has(cacheKey)) {
      const p = invoke<{ data_url: string }>("get_user_avatar", { serverId, userId })
        .then((r) => {
          cache.set(cacheKey, r.data_url);
          pending.delete(cacheKey);
          return r.data_url;
        })
        .catch(() => { pending.delete(cacheKey); return ""; });
      pending.set(cacheKey, p);
    }

    pending.get(cacheKey)!.then((u) => { if (u) setUrl(u); });
  }, [userId, serverId, cacheKey, cached]);

  return url;
}
