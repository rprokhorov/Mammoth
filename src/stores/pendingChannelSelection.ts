// Cold-start / notification navigation guard.
//
// Notifications (both the live `notif:navigate-channel` event and the
// `check_pending_notification` cold-start path) can ask us to open a channel
// BEFORE the channel list has finished loading. Selecting a channel that isn't
// in the loaded list sets a stale `activeChannelId`, skips last-viewed priming,
// and suppresses the "auto-select first public channel" fallback in the
// `channels-loaded` handler.
//
// To avoid that, callers route channel selections through
// `resolveChannelSelection`: if the target channel is already loaded, the
// selection is "ready" and can proceed immediately; otherwise it is "deferred"
// and stashed here so `channels-loaded` can re-apply it once the channel exists.

import type { ChannelInfo } from "@/stores/uiStore";

let pendingChannelId: string | null = null;

export type ChannelSelectionResult = "ready" | "deferred";

/**
 * Decide whether a channel selection can proceed now.
 *
 * - Returns `"ready"` when `channelId` is present in `channels` (or `channels`
 *   is non-empty and the caller wants immediate behavior); any previously
 *   pending selection for this channel is cleared.
 * - Returns `"deferred"` when the channel isn't loaded yet; the id is stashed
 *   so it can be retried from the `channels-loaded` handler.
 */
export function resolveChannelSelection(
  channelId: string,
  channels: Pick<ChannelInfo, "id">[],
): ChannelSelectionResult {
  const isLoaded = channels.some((ch) => ch.id === channelId);
  if (isLoaded) {
    if (pendingChannelId === channelId) {
      pendingChannelId = null;
    }
    return "ready";
  }
  // Channel not loaded yet — remember it and retry after channels arrive.
  pendingChannelId = channelId;
  return "deferred";
}

export function getPendingChannelSelection(): string | null {
  return pendingChannelId;
}

export function clearPendingChannelSelection(): void {
  pendingChannelId = null;
}
