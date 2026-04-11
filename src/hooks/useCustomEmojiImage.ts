import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCustomEmojiStore } from "@/stores/customEmojiStore";
import { useUiStore } from "@/stores/uiStore";

// Completed cache: emojiId → dataUrl (persists for app lifetime)
const resolved = new Map<string, string>();
// Currently fetching
const inflight = new Set<string>();
// Waiting callbacks: emojiId → Set of callbacks
const waiters = new Map<string, Set<(url: string) => void>>();
// Concurrency
let active = 0;
const MAX_CONCURRENT = 8;
// Pending emoji ids (LIFO stack — most recent requests processed first)
const pendingStack: string[] = [];

function processNext() {
  while (active < MAX_CONCURRENT && pendingStack.length > 0) {
    const emojiId = pendingStack.pop()!;
    // Skip if already resolved or in-flight
    if (resolved.has(emojiId) || inflight.has(emojiId)) {
      // If resolved while waiting, notify waiters
      if (resolved.has(emojiId)) {
        notifyWaiters(emojiId, resolved.get(emojiId)!);
      }
      continue;
    }
    startFetch(emojiId);
  }
}

function notifyWaiters(emojiId: string, url: string) {
  const cbs = waiters.get(emojiId);
  if (cbs) {
    waiters.delete(emojiId);
    for (const cb of cbs) cb(url);
  }
}

function startFetch(emojiId: string) {
  const serverId = useUiStore.getState().activeServerId;
  if (!serverId) return;

  active++;
  inflight.add(emojiId);

  invoke<{ data_url: string }>("get_custom_emoji_image", { serverId, emojiId })
    .then((r) => {
      resolved.set(emojiId, r.data_url);
      useCustomEmojiStore.getState().cacheImage(emojiId, r.data_url);
      notifyWaiters(emojiId, r.data_url);
    })
    .catch(() => {
      // Don't cache failures — allow retry later
    })
    .finally(() => {
      active--;
      inflight.delete(emojiId);
      processNext();
    });
}

function requestEmoji(emojiId: string, cb: (url: string) => void): () => void {
  // Already resolved
  if (resolved.has(emojiId)) {
    cb(resolved.get(emojiId)!);
    return () => {};
  }

  // Register waiter
  if (!waiters.has(emojiId)) {
    waiters.set(emojiId, new Set());
  }
  waiters.get(emojiId)!.add(cb);

  // Add to pending stack if not already in-flight
  if (!inflight.has(emojiId)) {
    pendingStack.push(emojiId);
    processNext();
  }

  // Cleanup: remove this callback from waiters
  return () => {
    const cbs = waiters.get(emojiId);
    if (cbs) {
      cbs.delete(cb);
      if (cbs.size === 0) waiters.delete(emojiId);
    }
  };
}

export function useCustomEmojiImage(emojiId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!emojiId) return null;
    return resolved.get(emojiId)
      ?? useCustomEmojiStore.getState().imageCache[emojiId]
      ?? null;
  });
  const idRef = useRef(emojiId);

  useEffect(() => {
    idRef.current = emojiId;
    if (!emojiId) { setUrl(null); return; }

    // Check caches
    const cached = resolved.get(emojiId)
      ?? useCustomEmojiStore.getState().imageCache[emojiId];
    if (cached) {
      resolved.set(emojiId, cached); // promote to fast cache
      setUrl(cached);
      return;
    }

    const cleanup = requestEmoji(emojiId, (u) => {
      if (idRef.current === emojiId) setUrl(u);
    });

    return cleanup;
  }, [emojiId]);

  return url;
}
