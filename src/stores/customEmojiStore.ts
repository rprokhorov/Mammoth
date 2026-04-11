import { create } from "zustand";

export interface CustomEmoji {
  id: string;
  name: string;
}

const EMOJI_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CustomEmojiState {
  emojis: CustomEmoji[];
  imageCache: Record<string, string>; // emojiId → data URL
  fetchedAt: number | null;
  loading: boolean;
  loadedCount: number;
  setEmojis: (emojis: CustomEmoji[]) => void;
  setLoading: (loading: boolean) => void;
  finishLoading: () => void;
  cacheImage: (emojiId: string, dataUrl: string) => void;
  isFresh: () => boolean;
}

export const useCustomEmojiStore = create<CustomEmojiState>((set, get) => ({
  emojis: [],
  imageCache: {},
  fetchedAt: null,
  loading: false,
  loadedCount: 0,
  setEmojis: (emojis) => set({ emojis, loadedCount: emojis.length }),
  setLoading: (loading) => set({ loading }),
  finishLoading: () => set({ loading: false, fetchedAt: Date.now() }),
  cacheImage: (emojiId, dataUrl) =>
    set((state) => ({
      imageCache: { ...state.imageCache, [emojiId]: dataUrl },
    })),
  isFresh: () => {
    const { fetchedAt, emojis } = get();
    return emojis.length > 0 && fetchedAt !== null && Date.now() - fetchedAt < EMOJI_TTL_MS;
  },
}));
