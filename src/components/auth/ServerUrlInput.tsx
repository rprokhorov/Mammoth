import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ServerUrlInputProps {
  onServerAdded: (serverId: string, serverUrl: string) => void;
}

export function ServerUrlInput({ onServerAdded }: ServerUrlInputProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  async function handleCheck() {
    if (!url.trim()) return;

    setStatus("checking");
    setError("");

    try {
      const reachable = await invoke<boolean>("ping_server", { url: url.trim() });
      if (reachable) {
        setStatus("ok");
      } else {
        setStatus("error");
        setError("Server returned an error");
      }
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  }

  async function handleAdd() {
    if (status !== "ok") return;

    try {
      const server = await invoke<{ id: string; url: string }>("add_server", {
        url: url.trim(),
        displayName: name.trim() || new URL(url.trim()).hostname,
      });
      onServerAdded(server.id, server.url);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="server-url-input">
      <h2>Add Mattermost Server</h2>

      <div className="form-group">
        <label htmlFor="server-url">Server URL</label>
        <input
          id="server-url"
          type="url"
          placeholder="https://mattermost.example.com"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setStatus("idle");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleCheck()}
        />
      </div>

      <div className="form-group">
        <label htmlFor="server-name">Display Name (optional)</label>
        <input
          id="server-name"
          type="text"
          placeholder="My Server"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="button-row">
        {status !== "ok" ? (
          <button
            onClick={handleCheck}
            disabled={!url.trim() || status === "checking"}
          >
            {status === "checking" ? "Checking..." : "Connect"}
          </button>
        ) : (
          <button onClick={handleAdd} className="primary">
            Add Server
          </button>
        )}
      </div>

      {status === "ok" && (
        <div className="success-message">Server is reachable</div>
      )}
    </div>
  );
}
