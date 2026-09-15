import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface VideoPlayerProps {
  fileId: string;
  serverId: string;
  fileName: string;
  fileSize: number;
  /** From the server's file info; used as the Blob type so the webview picks the right decoder. */
  mimeType: string;
  /** Intrinsic size from Mattermost's file info; 0 when the server has none. */
  width?: number;
  height?: number;
  onDownload: () => void;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Blob URLs are per-file and survive remounts while the message list scrolls. */
const blobUrlCache = new Map<string, string>();

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoPlayer({
  fileId,
  serverId,
  fileName,
  fileSize,
  mimeType,
  width,
  height,
  onDownload,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [srcUrl, setSrcUrl] = useState<string | null>(
    () => blobUrlCache.get(fileId) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [showRates, setShowRates] = useState(false);

  // Fetch the bytes on demand. Videos are large, so nothing is transferred
  // until the user actually asks to watch this one.
  const load = useCallback(async () => {
    if (srcUrl || loading) return;
    setLoading(true);
    setError(null);
    try {
      const bytes = await invoke<ArrayBuffer>("get_file_bytes", {
        serverId,
        fileId,
      });
      const blob = new Blob([bytes], { type: mimeType || "video/mp4" });
      const url = URL.createObjectURL(blob);
      blobUrlCache.set(fileId, url);
      setSrcUrl(url);
    } catch (e) {
      console.error("Video load failed:", e);
      setError("Не удалось загрузить видео");
    } finally {
      setLoading(false);
    }
  }, [fileId, serverId, mimeType, srcUrl, loading]);

  // Autoplay once the source lands from an explicit play click, but not when a
  // cached URL is reused on remount — that would start playback on scroll.
  const shouldAutoPlay = useRef(false);
  useEffect(() => {
    if (srcUrl && shouldAutoPlay.current && videoRef.current) {
      shouldAutoPlay.current = false;
      videoRef.current.play().catch(() => {/* user can press play */});
    }
  }, [srcUrl]);

  function handlePosterClick() {
    shouldAutoPlay.current = true;
    load();
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video) return;
    const next = Number(e.target.value);
    video.currentTime = next;
    setCurrentTime(next);
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    const next = Number(e.target.value);
    setVolume(next);
    setMuted(next === 0);
    if (video) {
      video.volume = next;
      video.muted = next === 0;
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
  }

  function applyRate(next: number) {
    const video = videoRef.current;
    if (video) video.playbackRate = next;
    setRate(next);
    setShowRates(false);
  }

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen().catch(() => {});
    }
  }

  // Keyboard control while the player has focus, matching common video UX.
  function handleKeyDown(e: React.KeyboardEvent) {
    const video = videoRef.current;
    if (!video) return;
    switch (e.key) {
      case " ":
      case "k":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 5);
        break;
      case "ArrowRight":
        e.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
        break;
      case "m":
        e.preventDefault();
        toggleMute();
        break;
      case "f":
        e.preventDefault();
        toggleFullscreen();
        break;
      default:
        break;
    }
  }

  // Size the poster to the video's aspect ratio when the server reports one,
  // so the message list does not jump when the player replaces it.
  const boxWidth = Math.min(width || 480, 480);
  const boxHeight =
    width && height ? Math.round((boxWidth * height) / width) : 270;

  if (!srcUrl) {
    return (
      <div
        className="video-poster"
        style={{ width: boxWidth, height: boxHeight }}
        onClick={loading ? undefined : handlePosterClick}
        title={loading ? "Загрузка…" : `Воспроизвести ${fileName}`}
      >
        {loading ? (
          <div className="spinner small" />
        ) : (
          <div className="video-poster-play">▶</div>
        )}
        <div className="video-poster-meta">
          <span className="video-poster-name">{fileName}</span>
          <span className="video-poster-size">
            {error ?? formatFileSize(fileSize)}
          </span>
        </div>
        <button
          className="video-poster-download"
          title="Скачать"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
        >
          ⬇
        </button>
      </div>
    );
  }

  return (
    <div
      className="video-player"
      ref={containerRef}
      style={{ width: boxWidth }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <video
        ref={videoRef}
        src={srcUrl}
        className="video-player-media"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onError={() => setError("Формат не поддерживается")}
      />

      {error && <div className="video-player-error">{error}</div>}

      <div className="video-controls">
        <button
          className="video-btn"
          onClick={togglePlay}
          title={playing ? "Пауза (пробел)" : "Воспроизвести (пробел)"}
        >
          {playing ? "❚❚" : "▶"}
        </button>

        <span className="video-time">{formatTime(currentTime)}</span>

        <input
          className="video-seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          title="Перемотка"
        />

        <span className="video-time">{formatTime(duration)}</span>

        <button
          className="video-btn"
          onClick={toggleMute}
          title={muted ? "Включить звук (M)" : "Выключить звук (M)"}
        >
          {muted || volume === 0 ? "🔇" : "🔊"}
        </button>

        <input
          className="video-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={handleVolume}
          title="Громкость"
        />

        <div className="video-rate-wrap">
          <button
            className="video-btn video-rate-btn"
            onClick={() => setShowRates((v) => !v)}
            title="Скорость воспроизведения"
          >
            {rate}×
          </button>
          {showRates && (
            <div className="video-rate-menu">
              {PLAYBACK_RATES.map((r) => (
                <button
                  key={r}
                  className={`video-rate-item ${r === rate ? "active" : ""}`}
                  onClick={() => applyRate(r)}
                >
                  {r}×
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="video-btn" onClick={onDownload} title="Скачать">
          ⬇
        </button>

        <button
          className="video-btn"
          onClick={toggleFullscreen}
          title="Во весь экран (F)"
        >
          ⛶
        </button>
      </div>
    </div>
  );
}
