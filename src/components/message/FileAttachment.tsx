import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FileInfo {
  id: string;
  name: string;
  extension: string;
  size: number;
  mime_type: string;
  width: number;
  height: number;
}

interface ImageDataResult {
  data_url: string;
}

interface FileAttachmentProps {
  fileIds: string[];
  serverId: string;
  onImageLoad?: () => void;
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"];

// Separate caches for thumbnails and full-size originals
const thumbnailCache = new Map<string, string>();
const originalCache = new Map<string, string>();

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// displayUrls: shows thumbnail first, replaced by original when ready
type ImageUrls = Record<string, string>;

export function FileAttachment({ fileIds, serverId, onImageLoad }: FileAttachmentProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [displayUrls, setDisplayUrls] = useState<ImageUrls>({});
  const [lightboxFileId, setLightboxFileId] = useState<string | null>(null);

  const lightboxUrl = lightboxFileId
    ? (originalCache.get(lightboxFileId) ?? displayUrls[lightboxFileId] ?? null)
    : null;

  const closeLightbox = useCallback(() => setLightboxFileId(null), []);

  useEffect(() => {
    if (!lightboxFileId) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightboxFileId, closeLightbox]);

  useEffect(() => {
    if (fileIds.length === 0) return;

    Promise.all(
      fileIds.map((id) =>
        invoke<FileInfo>("get_file_info", { serverId, fileId: id }).catch(() => null),
      ),
    ).then((results) => {
      const valid = results.filter(Boolean) as FileInfo[];
      setFiles(valid);

      for (const file of valid) {
        if (!IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())) continue;
        const mimeType = file.mime_type || `image/${file.extension.toLowerCase()}`;

        // If original already cached — show it directly
        if (originalCache.has(file.id)) {
          setDisplayUrls((prev) => ({ ...prev, [file.id]: originalCache.get(file.id)! }));
          continue;
        }

        // Step 1: show thumbnail immediately
        const loadOriginal = () => {
          invoke<ImageDataResult>("get_image_data", { serverId, fileId: file.id, mimeType })
            .then((result) => {
              originalCache.set(file.id, result.data_url);
              setDisplayUrls((prev) => ({ ...prev, [file.id]: result.data_url }));
            })
            .catch(console.error);
        };

        if (thumbnailCache.has(file.id)) {
          setDisplayUrls((prev) => ({ ...prev, [file.id]: thumbnailCache.get(file.id)! }));
          loadOriginal();
          continue;
        }

        invoke<ImageDataResult>("get_image_thumbnail", { serverId, fileId: file.id, mimeType })
          .then((result) => {
            thumbnailCache.set(file.id, result.data_url);
            setDisplayUrls((prev) => ({ ...prev, [file.id]: result.data_url }));
          })
          .catch(() => {/* no thumbnail — skip, original will show */})
          .finally(() => loadOriginal());
      }
    });
  }, [fileIds.join(","), serverId]);

  if (files.length === 0) return null;

  async function handleDownload(fileId: string, fileName: string) {
    try {
      const savePath = `${await getDownloadsPath()}/${fileName}`;
      await invoke("download_file", { serverId, fileId, savePath });
    } catch (e) {
      console.error("Download failed:", e);
    }
  }

  return (
    <>
      <div className="file-attachments">
        {files.map((file) => {
          const isImage = IMAGE_EXTENSIONS.includes(file.extension.toLowerCase());
          const thumbUrl = displayUrls[file.id];

          return (
            <div key={file.id} className={`file-attachment ${isImage ? "image" : "generic"}`}>
              {isImage ? (
                (() => {
                  const origW = file.width || 400;
                  const origH = file.height || 200;
                  const scale = Math.min(400 / origW, 300 / origH, 1);
                  const dispW = Math.round(origW * scale);
                  const dispH = Math.round(origH * scale);
                  return thumbUrl ? (
                    <div
                      className="file-image-preview"
                      onClick={() => setLightboxFileId(file.id)}
                      title="Click to enlarge"
                      style={{ width: dispW, height: dispH }}
                    >
                      <img
                        src={thumbUrl}
                        alt={file.name}
                        style={{ width: dispW, height: dispH, cursor: "zoom-in", display: "block" }}
                        onLoad={onImageLoad}
                      />
                    </div>
                  ) : (
                    <div className="file-image-loading" style={{ width: dispW, height: dispH }}>
                      <div className="spinner small" />
                      <span>{file.name}</span>
                    </div>
                  );
                })()
              ) : (
                <div className="file-generic">
                  <span className="file-icon">📄</span>
                  <div className="file-info">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{formatFileSize(file.size)}</span>
                  </div>
                  <button
                    className="file-download-btn"
                    onClick={() => handleDownload(file.id, file.name)}
                  >
                    ⬇
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={closeLightbox}>
          <img className="lightbox-image" src={lightboxUrl} alt="Preview" onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" onClick={closeLightbox}>✕</button>
        </div>
      )}
    </>
  );
}

async function getDownloadsPath(): Promise<string> {
  try {
    const { downloadDir } = await import("@tauri-apps/api/path");
    return await downloadDir();
  } catch {
    return "/tmp";
  }
}
