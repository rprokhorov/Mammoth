/**
 * Remembers the channel that was open when the app was last closed, so a
 * restart returns the user where they left off instead of the first public
 * channel in the list.
 *
 * Keyed per server+team: switching teams or servers should restore that
 * context's own last channel, not leak a channel id across them.
 */
const STORAGE_KEY = "mm-desktop-last-channel";

type LastChannelMap = Record<string, string>;

function storageKey(serverId: string, teamId: string): string {
  return `${serverId}:${teamId}`;
}

function readAll(): LastChannelMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LastChannelMap;
  } catch {
    // ignore — unreadable storage just means no remembered channel
  }
  return {};
}

export function getLastChannelId(
  serverId: string,
  teamId: string,
): string | null {
  return readAll()[storageKey(serverId, teamId)] ?? null;
}

export function setLastChannelId(
  serverId: string,
  teamId: string,
  channelId: string,
): void {
  try {
    const all = readAll();
    all[storageKey(serverId, teamId)] = channelId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage can be unavailable or full (private mode, blocked site data).
    // Losing persistence is acceptable; throwing out of a setter is not.
  }
}

/**
 * Pick the channel to open for a team: the remembered one when it is still
 * present in the channel list (it may have been left, archived, or renamed
 * away since), otherwise the first public channel as before.
 */
export function resolveInitialChannel<T extends { id: string; channel_type: string }>(
  channels: T[],
  serverId: string | null,
  teamId: string | null,
): T | undefined {
  if (serverId && teamId) {
    const rememberedId = getLastChannelId(serverId, teamId);
    if (rememberedId) {
      const remembered = channels.find((ch) => ch.id === rememberedId);
      if (remembered) return remembered;
    }
  }
  return channels.find((ch) => ch.channel_type === "O");
}
