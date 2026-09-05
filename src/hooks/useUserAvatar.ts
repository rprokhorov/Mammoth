import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";

// In-memory cache: serverId+userId → data URL
const cache = new Map<string, string>();
const MAX_CACHED_AVATARS = 256;
const pending = new Map<string, Promise<string>>();
// Listeners to notify components when a new avatar is loaded
const listeners = new Map<string, Set<(url: string) => void>>();

function subscribe(key: string, cb: (url: string) => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  return () => {
    const callbacks = listeners.get(key);
    callbacks?.delete(cb);
    if (callbacks?.size === 0) listeners.delete(key);
  };
}

function notify(key: string, url: string) {
  listeners.get(key)?.forEach((cb) => cb(url));
}

function getCached(key: string): string | undefined {
  const url = cache.get(key);
  if (url !== undefined) {
    cache.delete(key);
    cache.set(key, url);
  }
  return url;
}

function fetchAvatar(serverId: string, userId: string, key: string) {
  if (pending.has(key)) return;
  const request = invoke<{ data_url: string }>("get_user_avatar", { serverId, userId })
    .then((result) => {
      // An invalidation may have started a newer request for the same avatar.
      if (pending.get(key) !== request) return "";
      cache.delete(key);
      cache.set(key, result.data_url);
      while (cache.size > MAX_CACHED_AVATARS) {
        cache.delete(cache.keys().next().value!);
      }
      notify(key, result.data_url);
      return result.data_url;
    })
    .catch(() => "")
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
  pending.set(key, request);
}

export function clearUserAvatarCache(serverId: string, userId: string) {
  const key = `${serverId}:${userId}`;
  cache.delete(key);
  pending.delete(key);
  if (listeners.has(key)) fetchAvatar(serverId, userId, key);
}

export function useUserAvatar(userId: string | null): string | null {
  const serverId = useUiStore((s) => s.activeServerId);
  const cacheKey = serverId && userId ? `${serverId}:${userId}` : null;

  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!userId || !serverId || !cacheKey) return;

    // Keep cached avatars subscribed too, so profile uploads refresh mounted copies.
    const unsub = subscribe(cacheKey, (url) => setLoaded({ key: cacheKey, url }));
    const cached = getCached(cacheKey);
    if (cached !== undefined) setLoaded({ key: cacheKey, url: cached });
    else fetchAvatar(serverId, userId, cacheKey);

    return unsub;
  }, [userId, serverId, cacheKey]);

  if (!cacheKey) return null;
  return loaded?.key === cacheKey ? loaded.url : (cache.get(cacheKey) ?? null);
}
