import { useDraftsStore, type DraftData } from "@/stores/draftsStore";
import { useUiStore } from "@/stores/uiStore";
import { useTabsStore } from "@/stores/tabsStore";
import { primeLastViewedSnapshot } from "@/stores/lastViewedSnapshot";
import { useThreadsStore } from "@/stores/threadsStore";

export function DraftsView() {
  const drafts = useDraftsStore((s) => s.drafts);
  const clearDraft = useDraftsStore((s) => s.clearDraft);
  const channels = useUiStore((s) => s.channels);
  const users = useUiStore((s) => s.users);

  const draftList = Object.values(drafts).sort((a, b) => b.updateAt - a.updateAt);

  function getChannelLabel(channelId: string): string {
    const ch = channels.find((c) => c.id === channelId);
    if (!ch) return "Unknown channel";
    if (ch.channel_type === "D") {
      const currentUserId = useUiStore.getState().currentUserId;
      const parts = ch.name.split("__");
      for (const part of parts) {
        if (part === currentUserId) continue;
        const u = users[part];
        if (u) return u.nickname || `${u.first_name} ${u.last_name}`.trim() || u.username;
      }
      return ch.display_name || "Direct Message";
    }
    return ch.display_name || ch.name;
  }

  function getChannelPrefix(channelId: string): string {
    const ch = channels.find((c) => c.id === channelId);
    if (!ch) return "#";
    if (ch.channel_type === "D" || ch.channel_type === "G") return "@";
    if (ch.channel_type === "P") return "🔒";
    return "#";
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function handleOpen(draft: DraftData) {
    const uiStore = useUiStore.getState();
    const ch = uiStore.channels.find((c) => c.id === draft.channelId);
    if (ch) primeLastViewedSnapshot(ch.id, ch.last_viewed_at);
    uiStore.setActiveChannelId(draft.channelId);
    uiStore.setMainSubView("channels");
    useTabsStore.getState().navigateDefaultTab(draft.channelId);

    if (draft.rootId) {
      // Open thread panel
      useThreadsStore.getState().setActiveThread(draft.rootId);
    }
  }

  function handleDiscard(draft: DraftData) {
    clearDraft(draft.channelId, draft.rootId);
  }

  return (
    <div className="threads-view">
      <div className="threads-view-header">
        <h3>Drafts</h3>
      </div>

      <div className="threads-list">
        {draftList.length === 0 ? (
          <div className="threads-empty">
            <p className="muted">No drafts saved</p>
          </div>
        ) : (
          draftList.map((draft) => {
            const key = draft.rootId ? `thread:${draft.rootId}` : `channel:${draft.channelId}`;
            const label = getChannelLabel(draft.channelId);
            const prefix = getChannelPrefix(draft.channelId);
            const preview = draft.message.length > 120
              ? draft.message.slice(0, 120) + "..."
              : draft.message;

            return (
              <div
                key={key}
                className="thread-list-item draft-list-item"
                onClick={() => handleOpen(draft)}
                style={{ cursor: "pointer" }}
              >
                <div className="thread-list-content">
                  <div className="thread-list-header">
                    <div className="thread-list-author-row">
                      <span className="thread-list-author">
                        {prefix} {label}
                        {draft.rootId && (
                          <span className="draft-thread-badge"> · Thread reply</span>
                        )}
                      </span>
                    </div>
                    <div className="draft-actions">
                      <span className="thread-list-time">{formatTime(draft.updateAt)}</span>
                      <button
                        className="draft-discard-btn"
                        title="Discard draft"
                        onClick={(e) => { e.stopPropagation(); handleDiscard(draft); }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="thread-list-preview draft-preview">{preview}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
