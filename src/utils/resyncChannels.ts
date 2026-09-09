/**
 * Merge a freshly fetched channel list into the currently displayed one.
 *
 * The "channels-loaded" event fires both at startup and on resync after a
 * wake/reconnect. On resync a channel is usually open, and `view_channel` is
 * sent asynchronously after its posts load — so the server may still report
 * that channel as unread. Applying the server counts verbatim would paint an
 * unread badge on the channel the user is actively reading.
 *
 * Every other channel takes the server's authoritative counts, which is the
 * whole point of the resync: unreads that arrived while the socket was down
 * are only recoverable over HTTP.
 */
export interface ResyncChannel {
  id: string;
  total_msg_count: number;
  msg_count: number;
  mention_count: number;
  last_viewed_at: number;
}

export function mergeChannelsPreservingActive<T extends ResyncChannel>(
  incoming: T[],
  previous: T[],
  activeChannelId: string | null,
): T[] {
  if (!activeChannelId) return incoming;
  return incoming.map((ch) => {
    if (ch.id !== activeChannelId) return ch;
    const prev = previous.find((c) => c.id === ch.id);
    if (!prev) return ch;
    return {
      ...ch,
      msg_count: ch.total_msg_count,
      mention_count: 0,
      last_viewed_at: prev.last_viewed_at,
    };
  });
}
