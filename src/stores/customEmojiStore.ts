import { create } from "zustand";

export interface CustomEmoji {
  id: string;
  name: string;
}

interface CustomEmojiState {
  emojis: CustomEmoji[];           // list of all custom emojis
  imageCache: Map<string, string>; // emojiId → data URL
  setEmojis: (emojis: CustomEmoji[]) => void;
  cacheImage: (emojiId: string, dataUrl: string) => void;
}

export const useCustomEmojiStore = create<CustomEmojiState>((set) => ({
  emojis: [],
  imageCache: new Map(),
  setEmojis: (emojis) => set({ emojis }),
  cacheImage: (emojiId, dataUrl) =>
    set((state) => {
      const newMap = new Map(state.imageCache);
      newMap.set(emojiId, dataUrl);
      return { imageCache: newMap };
    }),
}));
