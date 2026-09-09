import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  getLastChannelId,
  setLastChannelId,
  resolveInitialChannel,
} from "@/utils/lastChannel";

interface Chan {
  id: string;
  channel_type: string;
}

const town = { id: "town", channel_type: "O" };
const random = { id: "random", channel_type: "O" };
const dm = { id: "dm1", channel_type: "D" };

describe("lastChannel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips the remembered channel per server+team", () => {
    setLastChannelId("s1", "t1", "c1");
    setLastChannelId("s1", "t2", "c2");
    setLastChannelId("s2", "t1", "c3");

    expect(getLastChannelId("s1", "t1")).toBe("c1");
    expect(getLastChannelId("s1", "t2")).toBe("c2");
    expect(getLastChannelId("s2", "t1")).toBe("c3");
    expect(getLastChannelId("s9", "t9")).toBeNull();
  });

  it("reopens the remembered channel instead of the first public one", () => {
    setLastChannelId("s1", "t1", "random");
    const channels: Chan[] = [town, random, dm];

    expect(resolveInitialChannel(channels, "s1", "t1")?.id).toBe("random");
  });

  it("restores a DM, not just public channels", () => {
    setLastChannelId("s1", "t1", "dm1");
    expect(resolveInitialChannel([town, dm], "s1", "t1")?.id).toBe("dm1");
  });

  it("falls back to the first public channel when nothing is remembered", () => {
    expect(resolveInitialChannel([town, random], "s1", "t1")?.id).toBe("town");
  });

  it("falls back when the remembered channel is gone (left or archived)", () => {
    setLastChannelId("s1", "t1", "deleted-channel");
    expect(resolveInitialChannel([town, random], "s1", "t1")?.id).toBe("town");
  });

  it("falls back when server or team is not known yet", () => {
    setLastChannelId("s1", "t1", "random");
    expect(resolveInitialChannel([town, random], null, "t1")?.id).toBe("town");
    expect(resolveInitialChannel([town, random], "s1", null)?.id).toBe("town");
  });

  it("does not leak a remembered channel across teams", () => {
    setLastChannelId("s1", "t1", "random");
    expect(resolveInitialChannel([town, random], "s1", "t2")?.id).toBe("town");
  });
});

describe("lastChannel with unavailable storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw when writing is blocked (private mode, full quota)", () => {
    vi.spyOn(globalThis.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => setLastChannelId("s1", "t1", "c1")).not.toThrow();
  });

  it("treats unreadable storage as nothing remembered", () => {
    vi.spyOn(globalThis.localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getLastChannelId("s1", "t1")).toBeNull();
    expect(resolveInitialChannel([town], "s1", "t1")?.id).toBe("town");
  });

  it("treats corrupted JSON as nothing remembered", () => {
    localStorage.setItem("mm-desktop-last-channel", "{not json");
    expect(getLastChannelId("s1", "t1")).toBeNull();
  });
});
