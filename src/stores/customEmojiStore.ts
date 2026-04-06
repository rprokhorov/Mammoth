import { create } from "zustand";

export interface CustomEmoji {
  id: string;
  name: string;
}

const EMOJI_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CustomEmojiState {
  emojis: CustomEmoji[];           // list of all custom emojis
  imageCache: Map<string, string>; // emojiId → data URL
  fetchedAt: number | null;        // timestamp of last successful fetch
  setEmojis: (emojis: CustomEmoji[]) => void;
  cacheImage: (emojiId: string, dataUrl: string) => void;
  isFresh: () => boolean;
}

export const useCustomEmojiStore = create<CustomEmojiState>((set, get) => ({
  emojis: [],
  imageCache: new Map(),
  fetchedAt: null,
  setEmojis: (emojis) => set({ emojis, fetchedAt: Date.now() }),
  cacheImage: (emojiId, dataUrl) =>
    set((state) => {
      const newMap = new Map(state.imageCache);
      newMap.set(emojiId, dataUrl);
      return { imageCache: newMap };
    }),
  isFresh: () => {
    const { fetchedAt, emojis } = get();
    return emojis.length > 0 && fetchedAt !== null && Date.now() - fetchedAt < EMOJI_TTL_MS;
  },
}));
