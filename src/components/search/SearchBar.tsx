import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PostData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";

interface PostsResponse {
  order: string[];
  posts: Record<string, PostData>;
}

interface SearchBarProps {
  serverId: string;
  teamId: string;
}

export function SearchBar({ serverId, teamId }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PostData[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const users = useUiStore((s) => s.users);

  // Cmd+F to toggle
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  const doSearch = useCallback(
    async (terms: string) => {
      if (!terms.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await invoke<PostsResponse>("search_posts", {
          serverId,
          teamId,
          terms: terms.trim(),
        });
        const posts = res.order.map((id) => res.posts[id]).filter(Boolean);
        setResults(posts);
      } catch (e) {
        console.error("Search failed:", e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [serverId, teamId],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      doSearch(query);
    }
  }

  function handleSelectResult(post: PostData) {
    // Navigate to channel and close search
    useUiStore.getState().setActiveChannelId(post.channel_id);
    useUiStore.getState().setMainSubView("channels");
    setIsOpen(false);
  }

  if (!isOpen) return null;

  return (
    <div className="search-overlay" onClick={() => setIsOpen(false)}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Search messages... (from: in: before: after:)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {searching && <div className="spinner small" />}
        </div>

        {results.length > 0 && (
          <div className="search-results">
            {results.map((post) => {
              const user = users[post.user_id];
              const authorName = user?.username ?? post.user_id.slice(0, 8);
              const time = new Date(post.create_at).toLocaleDateString();

              return (
                <button
                  key={post.id}
                  className="search-result-item"
                  onClick={() => handleSelectResult(post)}
                >
                  <div className="search-result-header">
                    <span className="search-result-author">{authorName}</span>
                    <span className="search-result-time">{time}</span>
                  </div>
                  <div className="search-result-body">
                    {post.message.slice(0, 200)}
                    {post.message.length > 200 ? "..." : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {query && !searching && results.length === 0 && (
          <div className="search-empty">
            <p className="muted">No results found</p>
          </div>
        )}
      </div>
    </div>
  );
}
