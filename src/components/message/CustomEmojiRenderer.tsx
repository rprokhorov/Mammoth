/**
 * Wraps MarkdownRenderer and replaces :custom-emoji-name: tokens
 * with actual <img> elements after markdown parsing.
 */
import { useMemo, memo } from "react";
import { useCustomEmojiStore } from "@/stores/customEmojiStore";
import { useCustomEmojiImage } from "@/hooks/useCustomEmojiImage";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Props {
  text: string;
}

// Inline image for a single custom emoji — loads lazily via hook
const CustomEmojiImg = memo(function CustomEmojiImg({ id, name }: { id: string; name: string }) {
  const url = useCustomEmojiImage(id);
  if (!url) return <span>:{name}:</span>;
  return (
    <img
      src={url}
      alt={`:${name}:`}
      title={`:${name}:`}
      style={{ height: "1.2em", width: "auto", verticalAlign: "middle", display: "inline" }}
    />
  );
});

export const CustomEmojiRenderer = memo(function CustomEmojiRenderer({ text }: Props) {
  const emojis = useCustomEmojiStore((s) => s.emojis);

  // Build a name→id map for quick lookup
  const emojiMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of emojis) m.set(e.name, e.id);
    return m;
  }, [emojis]);

  // Check if text contains any custom emoji — if not, skip splitting
  const hasCustom = useMemo(() => {
    if (emojiMap.size === 0) return false;
    return /:([a-z0-9_-]+):/i.test(text);
  }, [text, emojiMap]);

  if (!hasCustom) {
    return <MarkdownRenderer text={text} />;
  }

  // Split by :name: tokens, render custom ones as <img>, rest as markdown
  const parts: React.ReactNode[] = [];
  let key = 0;

  const emojiRegex = /:([a-z0-9_-]+):/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  emojiRegex.lastIndex = 0;
  while ((match = emojiRegex.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    const id = emojiMap.get(name);
    if (!id) continue;

    // Text before this emoji
    if (match.index > lastIndex) {
      parts.push(<MarkdownRenderer key={key++} text={text.slice(lastIndex, match.index)} />);
    }
    parts.push(<CustomEmojiImg key={key++} id={id} name={name} />);
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last emoji
  if (lastIndex < text.length) {
    parts.push(<MarkdownRenderer key={key++} text={text.slice(lastIndex)} />);
  }

  return <>{parts}</>;
});
