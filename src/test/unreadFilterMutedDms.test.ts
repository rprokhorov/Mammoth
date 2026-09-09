import { afterEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Mirrors the sidebar predicates in ChannelList. Kept as a standalone copy so
 * the filter rules can be exercised without mounting the whole sidebar.
 */
interface Chan {
  channel_type: string;
  mark_unread?: string;
  total_msg_count: number;
  msg_count: number;
  mention_count: number;
}

const isMuted = (c: Chan) => c.mark_unread === "mention";
const hasUnreadMessages = (c: Chan) =>
  c.total_msg_count > c.msg_count || c.mention_count > 0;
const isUnread = (c: Chan) => (isMuted(c) ? false : hasUnreadMessages(c));

function matchesUnreadFilter(c: Chan, includeMutedDms: boolean) {
  if (isUnread(c)) return true;
  if (!includeMutedDms) return false;
  const isDirect = c.channel_type === "D" || c.channel_type === "G";
  return isDirect && isMuted(c) && hasUnreadMessages(c);
}

function unreadBadgeCount(c: Chan, includeMutedDms: boolean): number {
  if (c.mention_count > 0) return c.mention_count;
  const isDirect = c.channel_type === "D" || c.channel_type === "G";
  if (!isDirect || !isMuted(c) || !includeMutedDms) return 0;
  return Math.max(0, c.total_msg_count - c.msg_count);
}

const hasMention = (c: Chan, includeMutedDms: boolean) =>
  isMuted(c) ? unreadBadgeCount(c, includeMutedDms) > 0 : c.mention_count > 0;

function chan(over: Partial<Chan> = {}): Chan {
  return {
    channel_type: "O", total_msg_count: 10, msg_count: 10,
    mention_count: 0, ...over,
  };
}

const mutedUnreadDm = chan({
  channel_type: "D", mark_unread: "mention", total_msg_count: 5, msg_count: 3,
});

describe("unread filter membership", () => {
  it("includes a muted DM that has unread messages", () => {
    expect(matchesUnreadFilter(mutedUnreadDm, true)).toBe(true);
  });

  it("includes a muted group chat that has unread messages", () => {
    const groupChat = { ...mutedUnreadDm, channel_type: "G" };
    expect(matchesUnreadFilter(groupChat, true)).toBe(true);
  });

  it("still excludes a muted regular channel", () => {
    const mutedChannel = { ...mutedUnreadDm, channel_type: "O" };
    expect(matchesUnreadFilter(mutedChannel, true)).toBe(false);
  });

  it("excludes a muted DM with nothing unread", () => {
    const read = { ...mutedUnreadDm, total_msg_count: 3, msg_count: 3 };
    expect(matchesUnreadFilter(read, true)).toBe(false);
  });

  it("excludes muted DMs when the setting is off", () => {
    expect(matchesUnreadFilter(mutedUnreadDm, false)).toBe(false);
  });

  it("keeps unmuted channels working regardless of the setting", () => {
    const normal = chan({ total_msg_count: 5, msg_count: 3 });
    expect(matchesUnreadFilter(normal, false)).toBe(true);
    expect(matchesUnreadFilter(normal, true)).toBe(true);
  });

  it("leaves sidebar highlighting untouched for muted DMs", () => {
    // The filter is wider than isUnread on purpose: mute must still mean no
    // bold text and no badge in the list itself.
    expect(isUnread(mutedUnreadDm)).toBe(false);
  });
});

describe("the setting itself", () => {
  // localStorage is absent in this test environment, so the store falls back to
  // defaults; persistence is covered by the store's own try/catch, not here.
  afterEach(() => {
    useSettingsStore.getState().updateSetting("unreadFilterIncludesMutedDms", true);
  });

  it("defaults to on, so muted DMs show up without any setup", () => {
    expect(useSettingsStore.getState().unreadFilterIncludesMutedDms).toBe(true);
  });

  it("can be turned off", () => {
    useSettingsStore.getState().updateSetting("unreadFilterIncludesMutedDms", false);
    expect(useSettingsStore.getState().unreadFilterIncludesMutedDms).toBe(false);
  });
});

describe("unread badge on muted DMs", () => {
  it("counts unread messages for a muted DM with no mentions", () => {
    // The reported case: a bot writes directly and never @-mentions anyone.
    expect(unreadBadgeCount(mutedUnreadDm, true)).toBe(2);
    expect(hasMention(mutedUnreadDm, true)).toBe(true);
  });

  it("prefers the mention count when there are mentions", () => {
    const withMention = { ...mutedUnreadDm, mention_count: 1 };
    expect(unreadBadgeCount(withMention, true)).toBe(1);
  });

  it("shows no badge for a muted regular channel", () => {
    const mutedChannel = { ...mutedUnreadDm, channel_type: "O" };
    expect(unreadBadgeCount(mutedChannel, true)).toBe(0);
    expect(hasMention(mutedChannel, true)).toBe(false);
  });

  it("shows no badge for a muted DM once everything is read", () => {
    const read = { ...mutedUnreadDm, total_msg_count: 3, msg_count: 3 };
    expect(unreadBadgeCount(read, true)).toBe(0);
    expect(hasMention(read, true)).toBe(false);
  });

  it("shows no badge when the setting is off", () => {
    expect(unreadBadgeCount(mutedUnreadDm, false)).toBe(0);
    expect(hasMention(mutedUnreadDm, false)).toBe(false);
  });

  it("leaves unmuted channels on the mention count", () => {
    const normal = chan({ total_msg_count: 9, msg_count: 3, mention_count: 0 });
    // Plenty unread, but no mentions: an unmuted channel shows bold, not a number.
    expect(unreadBadgeCount(normal, true)).toBe(0);
    expect(hasMention(normal, true)).toBe(false);
  });

  it("never renders a negative count", () => {
    const skewed = { ...mutedUnreadDm, total_msg_count: 2, msg_count: 5 };
    expect(unreadBadgeCount(skewed, true)).toBe(0);
  });
});
