// Frozen snapshot of channel.last_viewed_at captured at the moment the user
// first sees a channel in the current session. Mirrors the Mattermost webapp's
// `state.views.channel.lastChannelViewTime` map — intentionally NOT updated
// when `view_channel` (markChannelAsRead) runs, so the "first unread" anchor
// remains stable while the user is looking at the channel.

const snapshot = new Map<string, number>();

export function primeLastViewedSnapshot(channelId: string, lastViewedAt: number) {
  // Only set once per channel per session. Subsequent opens reuse the first
  // value, which is what the official client does.
  if (!snapshot.has(channelId)) {
    snapshot.set(channelId, lastViewedAt);
  }
}

export function getLastViewedSnapshot(channelId: string): number {
  return snapshot.get(channelId) ?? 0;
}

export function resetLastViewedSnapshot(channelId: string, newValue: number) {
  snapshot.set(channelId, newValue);
}

export function clearLastViewedSnapshots() {
  snapshot.clear();
}
