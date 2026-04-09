import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "@/stores/uiStore";
import { useTabsStore } from "@/stores/tabsStore";
import { UserAvatar } from "@/components/common/UserAvatar";

interface QuickSwitcherProps {
  serverId: string;
  teamId: string;
  currentUserId: string | null;
  onClose: () => void;
}

interface UserResult {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  nickname: string;
}

interface ChannelResult {
  id: string;
  display_name: string;
  name: string;
  channel_type: string;
}

type Result =
  | { kind: "channel"; data: ChannelResult }
  | { kind: "user"; data: UserResult };

type State = { results: Result[]; selected: number };
type Action =
  | { type: "SET_RESULTS"; results: Result[] }
  | { type: "APPEND_USERS"; users: Result[] }
  | { type: "MOVE"; dir: 1 | -1 }
  | { type: "SET_SELECTED"; index: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_RESULTS":
      return { results: action.results, selected: 0 };
    case "APPEND_USERS": {
      const channels = state.results.filter((r) => r.kind === "channel");
      return { ...state, results: [...channels, ...action.users].slice(0, 15) };
    }
    case "MOVE": {
      const next = Math.max(0, Math.min(state.selected + action.dir, state.results.length - 1));
      return { ...state, selected: next };
    }
    case "SET_SELECTED":
      return { ...state, selected: action.index };
  }
}

export function QuickSwitcher({ serverId, teamId, currentUserId, onClose }: QuickSwitcherProps) {
  const [query, setQuery] = useState("");
  const [{ results, selected }, dispatch] = useReducer(reducer, { results: [], selected: 0 });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const channels = useUiStore((s) => s.channels);

  // Keep a ref to current state for use in the keydown closure
  const stateRef = useRef({ results, selected });
  useEffect(() => { stateRef.current = { results, selected }; });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    itemRefs.current[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const searchGenRef = useRef(0); // generation counter to discard stale results

  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      dispatch({ type: "SET_RESULTS", results: [] });
      setLoading(false);
      return;
    }

    const gen = ++searchGenRef.current;
    setLoading(true);

    const t = term.toLowerCase();

    // 1. Show local channel matches instantly
    const matchedChannels: Result[] = channels
      .filter((ch) => {
        if (ch.channel_type === "D" || ch.channel_type === "G") return false;
        return ch.display_name.toLowerCase().includes(t) || ch.name.toLowerCase().includes(t);
      })
      .slice(0, 5)
      .map((ch) => ({ kind: "channel" as const, data: ch }));

    if (gen === searchGenRef.current) {
      dispatch({ type: "SET_RESULTS", results: matchedChannels });
    }

    // 2. Fast: remote channel search
    invoke<ChannelResult[]>("search_channels", { serverId, teamId, term })
      .then((remoteChans) => {
        if (gen !== searchGenRef.current) return;
        const seen = new Set(matchedChannels.map((r) => r.data.id));
        const extra: Result[] = [];
        for (const ch of remoteChans) {
          if (!seen.has(ch.id)) {
            extra.push({ kind: "channel", data: ch });
            seen.add(ch.id);
          }
        }
        dispatch({
          type: "SET_RESULTS",
          results: [...matchedChannels, ...extra].slice(0, 12),
        });
      })
      .catch(() => {});

    // 3. Slow: user search — appends to whatever channels are already shown
    Promise.allSettled([
      invoke<UserResult[]>("autocomplete_users", { serverId, teamId, term }),
      invoke<UserResult[]>("search_users", { serverId, teamId, term }),
    ]).then(([autocomplete, searched]) => {
      if (gen !== searchGenRef.current) return;
      const userMap = new Map<string, UserResult>();
      if (autocomplete.status === "fulfilled") {
        for (const u of autocomplete.value) userMap.set(u.id, u);
      }
      if (searched.status === "fulfilled") {
        for (const u of searched.value) userMap.set(u.id, u);
      }
      const userResults: Result[] = [];
      for (const u of userMap.values()) {
        if (u.id !== currentUserId) userResults.push({ kind: "user", data: u });
      }
      if (userResults.length === 0) return;
      dispatch({ type: "APPEND_USERS", users: userResults });
      setLoading(false);
    });

    // Mark channels loading done (users still loading)
    setLoading(false);
  }, [serverId, teamId, channels, currentUserId]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 150);
    return () => clearTimeout(t);
  }, [query, search]);

  function selectResult(r: Result) {
    if (r.kind === "channel") {
      const store = useUiStore.getState();
      store.setActiveChannelId(r.data.id);
      store.setMainSubView("channels");
      useTabsStore.getState().navigateDefaultTab(r.data.id);
      onClose();
    } else {
      invoke<{ id: string }>("create_direct_channel", { serverId, otherUserId: r.data.id })
        .then((ch) => {
          const store = useUiStore.getState();
          store.setActiveChannelId(ch.id);
          store.setMainSubView("channels");
          useTabsStore.getState().navigateDefaultTab(ch.id);
          onClose();
        })
        .catch(console.error);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopImmediatePropagation();
        dispatch({ type: "MOVE", dir: 1 });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        dispatch({ type: "MOVE", dir: -1 });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const { results: r, selected: s } = stateRef.current;
        if (r[s]) selectResult(r[s]);
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  function displayName(u: UserResult) {
    const full = [u.first_name, u.last_name].filter(Boolean).join(" ");
    return full || u.username;
  }

  return (
    <div className="quick-switcher-overlay" onClick={onClose}>
      <div className="quick-switcher" onClick={(e) => e.stopPropagation()}>
        <div className="quick-switcher-input-row">
          <span className="quick-switcher-icon">🔍</span>
          <input
            ref={inputRef}
            className="quick-switcher-input"
            placeholder="Find channels or people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && <div className="spinner small" />}
        </div>

        {results.length > 0 && (
          <div className="quick-switcher-results">
            {results.map((r, i) => (
              <button
                key={r.kind + r.data.id}
                ref={(el) => { itemRefs.current[i] = el; }}
                className={`quick-switcher-item ${i === selected ? "selected" : ""}`}
                onMouseEnter={() => dispatch({ type: "SET_SELECTED", index: i })}
                onClick={() => selectResult(r)}
              >
                {r.kind === "channel" ? (
                  <>
                    <span className="quick-switcher-prefix">
                      {r.data.channel_type === "P" ? "🔒" : "#"}
                    </span>
                    <span className="quick-switcher-name">
                      {r.data.display_name || r.data.name}
                    </span>
                  </>
                ) : (
                  <>
                    <UserAvatar
                      userId={r.data.id}
                      username={r.data.username}
                      size={22}
                      className="quick-switcher-avatar"
                    />
                    <span className="quick-switcher-name">{displayName(r.data)}</span>
                    <span className="quick-switcher-sub">@{r.data.username}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        {query.trim() && !loading && results.length === 0 && (
          <div className="quick-switcher-empty">No results</div>
        )}

        {!query && (
          <div className="quick-switcher-hint">
            Type to search channels and people
          </div>
        )}
      </div>
    </div>
  );
}
