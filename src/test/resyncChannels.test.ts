import { describe, expect, it } from "vitest";
import {
  mergeChannelsPreservingActive,
  type ResyncChannel,
} from "@/utils/resyncChannels";

function chan(over: Partial<ResyncChannel> & { id: string }): ResyncChannel {
  return {
    total_msg_count: 10,
    msg_count: 10,
    mention_count: 0,
    last_viewed_at: 1000,
    ...over,
  };
}

describe("mergeChannelsPreservingActive", () => {
  it("adopts server unread counts for channels missed while the socket was down", () => {
    // The core of the wake-from-sleep fix: messages that arrived while the app
    // was asleep only exist in the server's counts, never in a `posted` event.
    const previous = [chan({ id: "a", total_msg_count: 10, msg_count: 10 })];
    const incoming = [
      chan({ id: "a", total_msg_count: 15, msg_count: 10, mention_count: 2 }),
    ];

    const merged = mergeChannelsPreservingActive(incoming, previous, "other");

    expect(merged[0].total_msg_count).toBe(15);
    expect(merged[0].msg_count).toBe(10);
    expect(merged[0].mention_count).toBe(2);
  });

  it("keeps the active channel read even when the server still reports it unread", () => {
    // `view_channel` is sent asynchronously after posts load, so a resync can
    // race it and would otherwise badge the channel being read.
    const previous = [chan({ id: "a", last_viewed_at: 5000 })];
    const incoming = [
      chan({ id: "a", total_msg_count: 15, msg_count: 10, mention_count: 3 }),
    ];

    const merged = mergeChannelsPreservingActive(incoming, previous, "a");

    expect(merged[0].mention_count).toBe(0);
    expect(merged[0].msg_count).toBe(merged[0].total_msg_count);
    expect(merged[0].last_viewed_at).toBe(5000);
  });

  it("does not suppress unreads in other channels while one is active", () => {
    const previous = [chan({ id: "a" }), chan({ id: "b" })];
    const incoming = [
      chan({ id: "a", total_msg_count: 12, msg_count: 10, mention_count: 1 }),
      chan({ id: "b", total_msg_count: 20, msg_count: 10, mention_count: 4 }),
    ];

    const merged = mergeChannelsPreservingActive(incoming, previous, "a");

    expect(merged[0].mention_count).toBe(0);
    expect(merged[1].mention_count).toBe(4);
    expect(merged[1].msg_count).toBe(10);
  });

  it("passes the server list through untouched when no channel is open", () => {
    const incoming = [chan({ id: "a", msg_count: 3, mention_count: 7 })];
    expect(mergeChannelsPreservingActive(incoming, [], null)).toEqual(incoming);
  });

  it("takes the server row for a newly joined active channel absent locally", () => {
    const incoming = [chan({ id: "a", mention_count: 5 })];
    const merged = mergeChannelsPreservingActive(incoming, [], "a");
    expect(merged[0].mention_count).toBe(5);
  });
});
