import { describe, it, expect, beforeEach } from "vitest";
import {
  primeLastViewedSnapshot,
  getLastViewedSnapshot,
  resetLastViewedSnapshot,
  clearLastViewedSnapshots,
} from "@/stores/lastViewedSnapshot";

describe("lastViewedSnapshot", () => {
  beforeEach(() => {
    clearLastViewedSnapshots();
  });

  describe("primeLastViewedSnapshot", () => {
    it("stores last_viewed_at for a channel", () => {
      primeLastViewedSnapshot("ch1", 12345);
      expect(getLastViewedSnapshot("ch1")).toBe(12345);
    });

    it("does not overwrite once set (session-stable)", () => {
      primeLastViewedSnapshot("ch1", 1000);
      primeLastViewedSnapshot("ch1", 9999);
      expect(getLastViewedSnapshot("ch1")).toBe(1000);
    });

    it("sets independently for different channels", () => {
      primeLastViewedSnapshot("ch1", 1000);
      primeLastViewedSnapshot("ch2", 2000);
      expect(getLastViewedSnapshot("ch1")).toBe(1000);
      expect(getLastViewedSnapshot("ch2")).toBe(2000);
    });
  });

  describe("getLastViewedSnapshot", () => {
    it("returns 0 for unknown channel", () => {
      expect(getLastViewedSnapshot("not-set")).toBe(0);
    });
  });

  describe("resetLastViewedSnapshot", () => {
    it("overwrites existing value", () => {
      primeLastViewedSnapshot("ch1", 1000);
      resetLastViewedSnapshot("ch1", 5000);
      expect(getLastViewedSnapshot("ch1")).toBe(5000);
    });

    it("sets value even if not previously primed", () => {
      resetLastViewedSnapshot("ch1", 7777);
      expect(getLastViewedSnapshot("ch1")).toBe(7777);
    });
  });

  describe("clearLastViewedSnapshots", () => {
    it("clears all stored snapshots", () => {
      primeLastViewedSnapshot("ch1", 1000);
      primeLastViewedSnapshot("ch2", 2000);
      clearLastViewedSnapshots();
      expect(getLastViewedSnapshot("ch1")).toBe(0);
      expect(getLastViewedSnapshot("ch2")).toBe(0);
    });
  });
});
