import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCustomEmojiStore } from "@/stores/customEmojiStore";
import { useUiStore } from "@/stores/uiStore";

// Pending fetches to avoid duplicate requests
const pending = new Map<string, Promise<string>>();

export function useCustomEmojiImage(emojiId: string | null): string | null {
  const cached = useCustomEmojiStore((s) => (emojiId ? s.imageCache.get(emojiId) ?? null : null));
  const [url, setUrl] = useState<string | null>(cached);

  useEffect(() => {
    if (!emojiId || cached) { setUrl(cached); return; }
    const serverId = useUiStore.getState().activeServerId;
    if (!serverId) return;

    if (!pending.has(emojiId)) {
      const p = invoke<{ data_url: string }>("get_custom_emoji_image", { serverId, emojiId })
        .then((r) => {
          useCustomEmojiStore.getState().cacheImage(emojiId, r.data_url);
          pending.delete(emojiId);
          return r.data_url;
        })
        .catch(() => { pending.delete(emojiId); return ""; });
      pending.set(emojiId, p);
    }

    pending.get(emojiId)!.then((u) => { if (u) setUrl(u); });
  }, [emojiId, cached]);

  return url;
}
