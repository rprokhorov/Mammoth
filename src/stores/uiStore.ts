import { create } from "zustand";

export interface Server {
  id: string;
  displayName: string;
  url: string;
  connected: boolean;
  username?: string;
}

export interface TeamInfo {
  id: string;
  display_name: string;
  name: string;
}

export interface ChannelInfo {
  id: string;
  team_id: string;
  display_name: string;
  name: string;
  channel_type: string; // "O" = public, "P" = private, "D" = DM, "G" = group
  header: string;
  purpose: string;
  last_post_at: number;
  total_msg_count: number;
  msg_count: number;
  mention_count: number;
  last_viewed_at: number;
}

export interface UserInfo {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  nickname: string;
  email: string;
}

interface UiState {
  // Servers
  servers: Server[];
  activeServerId: string | null;
  currentView: "login" | "add-server" | "main";

  // Teams & Channels
  teams: TeamInfo[];
  activeTeamId: string | null;
  channels: ChannelInfo[];
  activeChannelId: string | null;

  // Users cache
  users: Record<string, UserInfo>;

  // Sub-view within main: "channels" or "threads"
  mainSubView: "channels" | "threads";

  // User presence: userId -> "online" | "away" | "dnd" | "offline"
  userStatuses: Record<string, string>;

  // Typing: channelId -> userId[] (who is currently typing)
  typingUsers: Record<string, string[]>;

  // Favorites
  favoriteChannels: Set<string>;

  // WS status
  wsStatus: string;

  // Server actions
  setServers: (servers: Server[]) => void;
  addServer: (server: Server) => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<Server>) => void;
  setActiveServerId: (id: string | null) => void;
  setCurrentView: (view: UiState["currentView"]) => void;

  // Team actions
  setTeams: (teams: TeamInfo[]) => void;
  setActiveTeamId: (id: string | null) => void;

  // Channel actions
  setChannels: (channels: ChannelInfo[]) => void;
  setActiveChannelId: (id: string | null) => void;
  updateChannelMentions: (channelId: string, mentionCount: number, msgCount: number) => void;

  // User actions
  setUsers: (users: UserInfo[]) => void;

  // Presence
  setUserStatus: (userId: string, status: string) => void;
  setUserStatuses: (statuses: Record<string, string>) => void;

  // Typing
  addTypingUser: (channelId: string, userId: string) => void;
  removeTypingUser: (channelId: string, userId: string) => void;

  // Sub-view
  setMainSubView: (view: UiState["mainSubView"]) => void;

  // Favorites
  setFavoriteChannels: (ids: string[]) => void;
  toggleFavorite: (channelId: string) => void;

  // WS
  setWsStatus: (status: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  servers: [],
  activeServerId: null,
  currentView: "add-server",

  teams: [],
  activeTeamId: null,
  channels: [],
  activeChannelId: null,

  users: {},
  userStatuses: {},
  typingUsers: {},
  mainSubView: "channels",
  favoriteChannels: new Set<string>(),
  wsStatus: "disconnected",

  setServers: (servers) => set({ servers }),
  addServer: (server) =>
    set((state) => ({ servers: [...state.servers, server] })),
  removeServer: (id) =>
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
      activeServerId: state.activeServerId === id ? null : state.activeServerId,
    })),
  updateServer: (id, updates) =>
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      ),
    })),
  setActiveServerId: (id) => set({ activeServerId: id }),
  setCurrentView: (view) => set({ currentView: view }),

  setTeams: (teams) => set({ teams }),
  setActiveTeamId: (id) => set({ activeTeamId: id }),

  setChannels: (channels) => set({ channels }),
  setActiveChannelId: (id) => set({ activeChannelId: id }),
  updateChannelMentions: (channelId, mentionCount, msgCount) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? { ...ch, mention_count: mentionCount, msg_count: msgCount }
          : ch,
      ),
    })),

  setUsers: (users) =>
    set((state) => {
      const map = { ...state.users };
      for (const u of users) {
        map[u.id] = u;
      }
      return { users: map };
    }),

  setUserStatus: (userId, status) =>
    set((state) => ({
      userStatuses: { ...state.userStatuses, [userId]: status },
    })),
  setUserStatuses: (statuses) =>
    set((state) => ({
      userStatuses: { ...state.userStatuses, ...statuses },
    })),
  addTypingUser: (channelId, userId) =>
    set((state) => {
      const existing = state.typingUsers[channelId] || [];
      if (existing.includes(userId)) return state;
      return {
        typingUsers: { ...state.typingUsers, [channelId]: [...existing, userId] },
      };
    }),
  removeTypingUser: (channelId, userId) =>
    set((state) => {
      const existing = state.typingUsers[channelId] || [];
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: existing.filter((id) => id !== userId),
        },
      };
    }),
  setMainSubView: (view) => set({ mainSubView: view }),
  setFavoriteChannels: (ids) => set({ favoriteChannels: new Set(ids) }),
  toggleFavorite: (channelId) =>
    set((state) => {
      const next = new Set(state.favoriteChannels);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return { favoriteChannels: next };
    }),
  setWsStatus: (status) => set({ wsStatus: status }),
}));
