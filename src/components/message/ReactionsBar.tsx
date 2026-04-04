import { useState, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ReactionData } from "@/stores/messagesStore";
import { useUiStore } from "@/stores/uiStore";
import { useCustomEmojiStore } from "@/stores/customEmojiStore";
import { useCustomEmojiImage } from "@/hooks/useCustomEmojiImage";
import { emojiNameToUnicode } from "./EmojiPicker";

interface ReactionsBarProps {
  reactions: ReactionData[];
  postId: string;
  serverId: string;
  currentUserId: string | null;
  onReactionsChange: () => void;
}

// Renders a single emoji — custom (img) or standard (unicode)
const ReactionEmoji = memo(function ReactionEmoji({ name }: { name: string }) {
  const emojiId = useCustomEmojiStore((s) => s.emojis.find((e) => e.name === name)?.id ?? null);
  const imgUrl = useCustomEmojiImage(emojiId);

  if (emojiId) {
    if (!imgUrl) return <span style={{ fontSize: "1em" }}>…</span>;
    return (
      <img
        src={imgUrl}
        alt={`:${name}:`}
        style={{ height: "1.1em", width: "auto", verticalAlign: "middle" }}
      />
    );
  }

  const unicode = emojiNameToUnicode(name);
  return <span>{unicode.startsWith(":") ? name : unicode}</span>;
});

interface GroupedReaction {
  emoji_name: string;
  count: number;
  userIds: string[];
  reacted: boolean; // current user reacted
}

export function ReactionsBar({
  reactions,
  postId,
  serverId,
  currentUserId,
  onReactionsChange,
}: ReactionsBarProps) {
  const [toggling, setToggling] = useState<string | null>(null);
  const users = useUiStore((s) => s.users);

  if (!reactions || reactions.length === 0) return null;

  // Group reactions by emoji_name
  const groups: Record<string, GroupedReaction> = {};
  for (const r of reactions) {
    if (!groups[r.emoji_name]) {
      groups[r.emoji_name] = {
        emoji_name: r.emoji_name,
        count: 0,
        userIds: [],
        reacted: false,
      };
    }
    groups[r.emoji_name].count++;
    groups[r.emoji_name].userIds.push(r.user_id);
    if (r.user_id === currentUserId) {
      groups[r.emoji_name].reacted = true;
    }
  }

  async function handleToggle(emojiName: string, alreadyReacted: boolean) {
    if (toggling) return;
    setToggling(emojiName);
    try {
      if (alreadyReacted) {
        await invoke("remove_reaction", { serverId, postId, emojiName });
      } else {
        await invoke("add_reaction", { serverId, postId, emojiName });
      }
      onReactionsChange();
    } catch (e) {
      console.error("Failed to toggle reaction:", e);
    } finally {
      setToggling(null);
    }
  }

  function getTooltip(group: GroupedReaction): string {
    const names = group.userIds
      .slice(0, 5)
      .map((uid) => users[uid]?.username || uid.slice(0, 8));
    const remaining = group.userIds.length - 5;
    let tooltip = names.join(", ");
    if (remaining > 0) tooltip += ` and ${remaining} more`;
    return tooltip;
  }

  return (
    <div className="reactions-bar">
      {Object.values(groups).map((group) => (
        <button
          key={group.emoji_name}
          className={`reaction-chip ${group.reacted ? "reacted" : ""}`}
          onClick={() => handleToggle(group.emoji_name, group.reacted)}
          title={getTooltip(group)}
          disabled={toggling === group.emoji_name}
        >
          <span className="reaction-emoji">
            <ReactionEmoji name={group.emoji_name} />
          </span>
          <span className="reaction-count">{group.count}</span>
        </button>
      ))}
    </div>
  );
}
