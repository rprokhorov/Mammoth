import { create } from "zustand";
import type { PostData } from "./messagesStore";

export interface UserThread {
  id: string;
  reply_count: number;
  last_reply_at: number;
  last_viewed_at: number;
  participants: Array<{ id: string }>;
  post: PostData | null;
  unread_replies: number;
  unread_mentions: number;
  is_following: boolean;
}

interface ThreadsState {
  // Currently open thread root post id
  activeThreadId: string | null;
  // Thread posts: rootId -> ordered post ids (oldest first)
  threadOrder: Record<string, string[]>;
  // All thread posts by id (shares with messagesStore.posts for root)
  threadPosts: Record<string, PostData>;
  // User's followed threads list
  userThreads: UserThread[];
  userThreadsTotal: number;
  userThreadsUnread: number;
  // Loading
  threadLoading: boolean;

  setActiveThread: (threadId: string | null) => void;
  setThreadData: (rootId: string, order: string[], posts: Record<string, PostData>) => void;
  addThreadReply: (post: PostData) => void;
  updateThreadPost: (post: PostData) => void;
  removeThreadPost: (postId: string, rootId: string) => void;
  setUserThreads: (threads: UserThread[], total: number, unread: number) => void;
  setThreadLoading: (loading: boolean) => void;
  clearThread: () => void;
  markThreadRead: (threadId: string) => void;
  incrementThreadUnread: (threadId: string) => void;
  updateThreadFollowing: (threadId: string, isFollowing: boolean) => void;
}

export const useThreadsStore = create<ThreadsState>((set) => ({
  activeThreadId: null,
  threadOrder: {},
  threadPosts: {},
  userThreads: [],
  userThreadsTotal: 0,
  userThreadsUnread: 0,
  threadLoading: false,

  setActiveThread: (threadId) => set({ activeThreadId: threadId }),

  setThreadData: (rootId, order, posts) =>
    set((state) => ({
      threadOrder: { ...state.threadOrder, [rootId]: order },
      threadPosts: { ...state.threadPosts, ...posts },
    })),

  addThreadReply: (post) =>
    set((state) => {
      const rootId = post.root_id;
      if (!rootId) return state;
      const existing = state.threadOrder[rootId] || [];
      if (existing.includes(post.id)) return state;
      return {
        threadOrder: {
          ...state.threadOrder,
          [rootId]: [...existing, post.id],
        },
        threadPosts: { ...state.threadPosts, [post.id]: post },
      };
    }),

  updateThreadPost: (post) =>
    set((state) => ({
      threadPosts: { ...state.threadPosts, [post.id]: post },
    })),

  removeThreadPost: (postId, rootId) =>
    set((state) => {
      const order = (state.threadOrder[rootId] || []).filter((id) => id !== postId);
      const newPosts = { ...state.threadPosts };
      delete newPosts[postId];
      return {
        threadOrder: { ...state.threadOrder, [rootId]: order },
        threadPosts: newPosts,
      };
    }),

  setUserThreads: (threads, total, unread) =>
    set({ userThreads: threads, userThreadsTotal: total, userThreadsUnread: unread }),

  setThreadLoading: (loading) => set({ threadLoading: loading }),

  clearThread: () => set({ activeThreadId: null }),

  markThreadRead: (threadId) =>
    set((state) => {
      const thread = state.userThreads.find((t) => t.id === threadId);
      // Thread is unread if it's in the list with unread_replies > 0,
      // OR if it's not in the list at all (was incremented via incrementThreadUnread for unknown thread)
      const wasUnread = thread ? thread.unread_replies > 0 : false;
      // If thread not in list, we may have bumped the global counter anyway — check via a marker
      // We track this by checking if userThreadsUnread > count of unread threads in list
      const knownUnreadCount = state.userThreads.filter((t) => t.unread_replies > 0).length;
      const hasOrphanedCount = state.userThreadsUnread > knownUnreadCount;
      const shouldDecrement = wasUnread || (!thread && hasOrphanedCount);
      return {
        userThreads: state.userThreads.map((t) =>
          t.id === threadId
            ? { ...t, unread_replies: 0, unread_mentions: 0, last_viewed_at: Date.now() }
            : t,
        ),
        userThreadsUnread: shouldDecrement
          ? Math.max(0, state.userThreadsUnread - 1)
          : state.userThreadsUnread,
      };
    }),

  updateThreadFollowing: (threadId, isFollowing) =>
    set((state) => {
      const exists = state.userThreads.some((t) => t.id === threadId);
      if (exists) {
        return {
          userThreads: state.userThreads.map((t) =>
            t.id === threadId ? { ...t, is_following: isFollowing } : t,
          ),
        };
      }
      // Thread not in list yet — add a minimal entry so is_following is tracked
      const stub: UserThread = {
        id: threadId,
        reply_count: 0,
        last_reply_at: 0,
        last_viewed_at: 0,
        participants: [],
        post: null,
        unread_replies: 0,
        unread_mentions: 0,
        is_following: isFollowing,
      };
      return { userThreads: [...state.userThreads, stub] };
    }),

  incrementThreadUnread: (threadId) =>
    set((state) => {
      const thread = state.userThreads.find((t) => t.id === threadId);
      if (!thread) {
        // Thread not in local list yet — still bump the global unread counter
        return {
          userThreadsUnread: state.userThreadsUnread + 1,
        };
      }
      const wasRead = thread.unread_replies === 0;
      return {
        userThreads: state.userThreads.map((t) =>
          t.id === threadId
            ? { ...t, unread_replies: t.unread_replies + 1, reply_count: t.reply_count + 1, last_reply_at: Date.now() }
            : t,
        ),
        userThreadsUnread: wasRead
          ? state.userThreadsUnread + 1
          : state.userThreadsUnread,
      };
    }),
}));
