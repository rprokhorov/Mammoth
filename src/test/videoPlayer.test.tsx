import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { VideoPlayer } from "@/components/message/VideoPlayer";

const mockInvoke = vi.mocked(invoke);

// jsdom implements neither of these; the component must still work.
beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn(() => Promise.resolve()),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
});

function renderPlayer(overrides: Partial<Parameters<typeof VideoPlayer>[0]> = {}) {
  const onDownload = vi.fn();
  const utils = render(
    <VideoPlayer
      fileId={overrides.fileId ?? "f1"}
      serverId="s1"
      fileName="clip.mp4"
      fileSize={5 * 1024 * 1024}
      mimeType="video/mp4"
      width={1920}
      height={1080}
      onDownload={onDownload}
      {...overrides}
    />,
  );
  return { ...utils, onDownload };
}

describe("VideoPlayer", () => {
  it("shows a poster and fetches nothing until asked to play", () => {
    renderPlayer();

    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByText("5.0 MB")).toBeInTheDocument();
    // The whole point of the poster: a channel full of videos costs no traffic.
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("loads the bytes as a blob on click", async () => {
    mockInvoke.mockResolvedValueOnce(new ArrayBuffer(8));
    const { container } = renderPlayer({ fileId: "load-1" });

    fireEvent.click(screen.getByText("▶"));

    await waitFor(() => {
      expect(container.querySelector("video")).toBeInTheDocument();
    });
    expect(mockInvoke).toHaveBeenCalledWith("get_file_bytes", {
      serverId: "s1",
      fileId: "load-1",
    });
    expect(container.querySelector("video")).toHaveAttribute("src", "blob:mock-url");
  });

  it("reports a failed load instead of leaving a dead poster", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPlayer({ fileId: "err-1" });

    fireEvent.click(screen.getByText("▶"));

    await waitFor(() => {
      expect(screen.getByText("Не удалось загрузить видео")).toBeInTheDocument();
    });
  });

  it("downloads without loading the video for playback", () => {
    const { onDownload } = renderPlayer({ fileId: "dl-1" });

    fireEvent.click(screen.getByTitle("Скачать"));

    expect(onDownload).toHaveBeenCalledTimes(1);
    // Clicking download must not also start the (much larger) playback fetch.
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("exposes volume, speed, download and fullscreen controls once playing", async () => {
    mockInvoke.mockResolvedValueOnce(new ArrayBuffer(8));
    renderPlayer({ fileId: "ctl-1" });

    fireEvent.click(screen.getByText("▶"));
    await waitFor(() => expect(screen.getByTitle("Громкость")).toBeInTheDocument());

    expect(screen.getByTitle("Перемотка")).toBeInTheDocument();
    expect(screen.getByTitle("Скорость воспроизведения")).toBeInTheDocument();
    expect(screen.getByTitle("Во весь экран (F)")).toBeInTheDocument();
    expect(screen.getByTitle("Скачать")).toBeInTheDocument();
  });

  it("applies the chosen playback rate to the media element", async () => {
    mockInvoke.mockResolvedValueOnce(new ArrayBuffer(8));
    const { container } = renderPlayer({ fileId: "rate-1" });

    fireEvent.click(screen.getByText("▶"));
    await waitFor(() => expect(container.querySelector("video")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("Скорость воспроизведения"));
    fireEvent.click(screen.getByText("1.5×"));

    expect(container.querySelector("video")!.playbackRate).toBe(1.5);
    expect(screen.getByTitle("Скорость воспроизведения")).toHaveTextContent("1.5×");
  });

  it("mutes and unmutes through the volume slider", async () => {
    mockInvoke.mockResolvedValueOnce(new ArrayBuffer(8));
    const { container } = renderPlayer({ fileId: "vol-1" });

    fireEvent.click(screen.getByText("▶"));
    await waitFor(() => expect(container.querySelector("video")).toBeInTheDocument());

    const video = container.querySelector("video")!;
    fireEvent.change(screen.getByTitle("Громкость"), { target: { value: "0.4" } });
    expect(video.volume).toBeCloseTo(0.4);
    expect(video.muted).toBe(false);

    // Dragging all the way down should mute, not just play silently.
    fireEvent.change(screen.getByTitle("Громкость"), { target: { value: "0" } });
    expect(video.muted).toBe(true);
  });

  it("keeps the poster box at the video's aspect ratio", () => {
    const { container } = renderPlayer({ fileId: "ar-1", width: 1920, height: 1080 });

    const poster = container.querySelector(".video-poster") as HTMLElement;
    expect(poster.style.width).toBe("480px");
    expect(poster.style.height).toBe("270px");
  });

  it("falls back to a default box when the server reports no dimensions", () => {
    const { container } = renderPlayer({ fileId: "ar-2", width: 0, height: 0 });

    const poster = container.querySelector(".video-poster") as HTMLElement;
    expect(poster.style.height).toBe("270px");
  });
});
