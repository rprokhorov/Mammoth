import { useState, useEffect } from "react";
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

interface FileUrlResult {
  url: string;
  token: string;
}

interface FileAttachmentProps {
  fileIds: string[];
  serverId: string;
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachment({ fileIds, serverId }: FileAttachmentProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (fileIds.length === 0) return;

    Promise.all(
      fileIds.map((id) =>
        invoke<FileInfo>("get_file_info", { serverId, fileId: id }).catch(
          () => null,
        ),
      ),
    ).then((results) => {
      const valid = results.filter(Boolean) as FileInfo[];
      setFiles(valid);

      // Get image URLs
      for (const file of valid) {
        if (IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())) {
          invoke<FileUrlResult>("get_file_url", {
            serverId,
            fileId: file.id,
          })
            .then((result) => {
              setImageUrls((prev) => ({
                ...prev,
                [file.id]: `${result.url}?_t=${result.token}`,
              }));
            })
            .catch(console.error);
        }
      }
    });
  }, [fileIds.join(","), serverId]);

  if (files.length === 0) return null;

  async function handleDownload(fileId: string, fileName: string) {
    try {
      // Use a simple download path in Downloads folder
      const savePath = `${await getDownloadsPath()}/${fileName}`;
      await invoke("download_file", { serverId, fileId, savePath });
    } catch (e) {
      console.error("Download failed:", e);
    }
  }

  return (
    <div className="file-attachments">
      {files.map((file) => {
        const isImage = IMAGE_EXTENSIONS.includes(
          file.extension.toLowerCase(),
        );
        const imgUrl = imageUrls[file.id];

        return (
          <div key={file.id} className={`file-attachment ${isImage ? "image" : "generic"}`}>
            {isImage && imgUrl ? (
              <div className="file-image-preview">
                <img
                  src={imgUrl}
                  alt={file.name}
                  style={{
                    maxWidth: Math.min(file.width || 400, 400),
                    maxHeight: 300,
                  }}
                />
              </div>
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
  );
}

async function getDownloadsPath(): Promise<string> {
  // Use Tauri path API if available, fallback to /tmp
  try {
    const { downloadDir } = await import("@tauri-apps/api/path");
    return await downloadDir();
  } catch {
    return "/tmp";
  }
}
