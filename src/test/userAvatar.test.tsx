import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { clearUserAvatarCache, useUserAvatar } from "@/hooks/useUserAvatar";
import { useUiStore } from "@/stores/uiStore";

let serverNumber = 0;
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useUiStore.setState({ activeServerId: `avatar-server-${serverNumber++}` });
});
afterEach(cleanup);

it("does not show the previous user's avatar while the next one loads or for null", async () => {
  vi.mocked(invoke).mockResolvedValueOnce({ data_url: "avatar-a" })
    .mockImplementationOnce(() => new Promise(() => {}));
  const { result, rerender } = renderHook(({ id }: { id: string | null }) => useUserAvatar(id),
    { initialProps: { id: "a" as string | null } });
  await waitFor(() => expect(result.current).toBe("avatar-a"));
  rerender({ id: "b" });
  expect(result.current).toBeNull();
  rerender({ id: null });
  expect(result.current).toBeNull();
});

it("coalesces requests and refreshes all mounted avatars after a profile upload", async () => {
  vi.mocked(invoke).mockResolvedValueOnce({ data_url: "old" })
    .mockResolvedValueOnce({ data_url: "new" });
  const first = renderHook(() => useUserAvatar("a"));
  const second = renderHook(() => useUserAvatar("a"));
  await waitFor(() => expect(second.result.current).toBe("old"));
  expect(invoke).toHaveBeenCalledTimes(1);
  await act(async () => clearUserAvatarCache(useUiStore.getState().activeServerId!, "a"));
  expect(first.result.current).toBe("new");
  expect(second.result.current).toBe("new");
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("ignores a stale response that finishes after invalidation", async () => {
  let completeOld!: (value: { data_url: string }) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise((resolve) => { completeOld = resolve; }))
    .mockResolvedValueOnce({ data_url: "new" });
  const { result } = renderHook(() => useUserAvatar("a"));
  await act(async () => clearUserAvatarCache(useUiStore.getState().activeServerId!, "a"));
  await act(async () => completeOld({ data_url: "old" }));
  expect(result.current).toBe("new");
});

it("evicts old entries after browsing more than 256 different avatars", async () => {
  vi.mocked(invoke).mockImplementation((_command, args) =>
    Promise.resolve({ data_url: (args as { userId: string }).userId }),
  );
  const { result, rerender } = renderHook(({ id }) => useUserAvatar(id), { initialProps: { id: "u0" } });
  await waitFor(() => expect(result.current).toBe("u0"));
  for (let i = 1; i <= 256; i++) {
    await act(async () => rerender({ id: `u${i}` }));
  }
  expect(invoke).toHaveBeenCalledTimes(257);
  await act(async () => rerender({ id: "u0" }));
  expect(invoke).toHaveBeenCalledTimes(258);
  expect(result.current).toBe("u0");
});
