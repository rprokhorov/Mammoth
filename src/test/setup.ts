import "@testing-library/jest-dom";

// Mock Tauri API — not available in test environment
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    listen: vi.fn(() => Promise.resolve(() => {})),
    setFocus: vi.fn(),
    show: vi.fn(),
  })),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: vi.fn(),
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(() => Promise.resolve("granted")),
}));

// Always install our own localStorage, even when the environment already
// provides one. Depending on the Node version, jsdom either exposes no
// localStorage at all (node started without --localstorage-file) or a native
// one whose methods cannot be intercepted by vi.spyOn, because they live
// behind an internal proxy rather than on the prototype. Tests that fake
// blocked storage would then silently write for real and leak state into the
// next test — a failure that only reproduced on CI. One implementation
// everywhere keeps spying, and therefore the suite, version-independent.
{
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length() {
      return this.store.size;
    }
    clear() {
      this.store.clear();
    }
    getItem(key: string) {
      return this.store.get(String(key)) ?? null;
    }
    key(index: number) {
      return Array.from(this.store.keys())[index] ?? null;
    }
    removeItem(key: string) {
      this.store.delete(String(key));
    }
    setItem(key: string, value: string) {
      this.store.set(String(key), String(value));
    }
  }
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
}
