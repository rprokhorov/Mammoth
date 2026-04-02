import { create } from "zustand";

export interface ReactionData {
  user_id: string;
  post_id: string;
  emoji_name: string;
  create_at: number;
}

export interface PostData {
  id: string;
  channel_id: string;
  user_id: string;
  root_id: string;
  message: string;
  post_type: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  edit_at: number;
  reply_count: number;
  is_pinned: boolean;
  file_ids: string[];
  props: Record<string, unknown>;
  metadata?: {
    reactions?: ReactionData[];
  };
}

interface MessagesState {
  // Posts per channel: channelId -> ordered post ids
  orderByChannel: Record<string, string[]>;
  // All posts by id
  posts: Record<string, PostData>;
  // Loading state
  loading: boolean;
  // Editing post id
  editingPostId: string | null;

  setChannelPosts: (channelId: string, order: string[], posts: Record<string, PostData>) => void;
  incrementReplyCount: (rootPostId: string) => void;
  addPost: (post: PostData) => void;
  updatePost: (post: PostData) => void;
  removePost: (postId: string) => void;
  prependOlderPosts: (channelId: string, order: string[], posts: Record<string, PostData>) => void;
  setLoading: (loading: boolean) => void;
  setEditingPostId: (postId: string | null) => void;
  clearChannel: (channelId: string) => void;
}

export const useMessagesStore = create<MessagesState>((set) => ({
  orderByChannel: {},
  posts: {},
  loading: false,
  editingPostId: null,

  setChannelPosts: (channelId, order, posts) =>
    set((state) => {
      // Compute reply counts from the loaded posts for root posts that have reply_count: 0
      const mergedPosts = { ...state.posts, ...posts };
      const replyCounts: Record<string, number> = {};
      for (const post of Object.values(posts)) {
        if (post.root_id) {
          replyCounts[post.root_id] = (replyCounts[post.root_id] || 0) + 1;
        }
      }
      for (const [rootId, count] of Object.entries(replyCounts)) {
        const rootPost = mergedPosts[rootId];
        if (rootPost && (rootPost.reply_count ?? 0) < count) {
          mergedPosts[rootId] = { ...rootPost, reply_count: count };
        }
      }
      return {
        orderByChannel: { ...state.orderByChannel, [channelId]: order },
        posts: mergedPosts,
      };
    }),

  incrementReplyCount: (rootPostId) =>
    set((state) => {
      const rootPost = state.posts[rootPostId];
      if (!rootPost) return state;
      return {
        posts: {
          ...state.posts,
          [rootPostId]: { ...rootPost, reply_count: (rootPost.reply_count ?? 0) + 1 },
        },
      };
    }),

  addPost: (post) =>
    set((state) => {
      const channelOrder = state.orderByChannel[post.channel_id] || [];
      // Add to beginning (newest first — Mattermost order is newest first)
      if (channelOrder.includes(post.id)) return state;
      return {
        orderByChannel: {
          ...state.orderByChannel,
          [post.channel_id]: [post.id, ...channelOrder],
        },
        posts: { ...state.posts, [post.id]: post },
      };
    }),

  updatePost: (post) =>
    set((state) => ({
      posts: { ...state.posts, [post.id]: post },
    })),

  removePost: (postId) =>
    set((state) => {
      const post = state.posts[postId];
      if (!post) return state;
      const newPosts = { ...state.posts };
      delete newPosts[postId];
      const channelOrder = (state.orderByChannel[post.channel_id] || []).filter(
        (id) => id !== postId,
      );
      return {
        posts: newPosts,
        orderByChannel: {
          ...state.orderByChannel,
          [post.channel_id]: channelOrder,
        },
      };
    }),

  prependOlderPosts: (channelId, order, posts) =>
    set((state) => {
      const existing = state.orderByChannel[channelId] || [];
      const newOrder = [...existing, ...order.filter((id) => !existing.includes(id))];
      return {
        orderByChannel: { ...state.orderByChannel, [channelId]: newOrder },
        posts: { ...state.posts, ...posts },
      };
    }),

  setLoading: (loading) => set({ loading }),
  setEditingPostId: (editingPostId) => set({ editingPostId }),
  clearChannel: (channelId) =>
    set((state) => {
      const newOrder = { ...state.orderByChannel };
      delete newOrder[channelId];
      return { orderByChannel: newOrder };
    }),
}));
