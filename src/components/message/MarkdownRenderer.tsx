import { marked, Renderer } from "marked";
import { useMemo, useState, useCallback } from "react";
import { emit } from "@tauri-apps/api/event";
import { emojiNameToUnicode } from "./EmojiPicker";
import { MermaidBlock } from "./MermaidBlock";
import { useUiStore } from "@/stores/uiStore";
import { UserPopover } from "@/components/user/UserPopover";

interface MarkdownRendererProps {
  text: string;
  serverId?: string;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const MERMAID_PLACEHOLDER = "<!--MERMAID_BLOCK_";
const MERMAID_PLACEHOLDER_END = "-->";

// Mermaid blocks collected during a single renderMarkdown call
let collectedMermaidBlocks: string[] = [];

// Custom renderer to handle Mattermost-specific elements
const renderer = new Renderer();

// Open links in system browser (target=_blank)
renderer.link = ({ href, title, text }) => {
  // Block javascript: and data: URLs
  if (/^(javascript|data|vbscript):/i.test(href ?? "")) return escapeAttr(text);
  const safeHref = escapeAttr(href ?? "");
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
  return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

// Code blocks — intercept mermaid, render others normally
renderer.code = ({ text, lang }) => {
  if (lang === "mermaid") {
    const idx = collectedMermaidBlocks.length;
    collectedMermaidBlocks.push(text);
    return `${MERMAID_PLACEHOLDER}${idx}${MERMAID_PLACEHOLDER_END}`;
  }
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const langClass = lang ? ` class="language-${escapeAttr(lang)}"` : "";
  return `<pre class="code-block"><code${langClass}>${escaped}</code></pre>`;
};

// Inline code
renderer.codespan = ({ text }) => {
  return `<code class="inline-code">${text}</code>`;
};

marked.setOptions({ renderer, gfm: true, breaks: true });

function getUserDisplayName(username: string, users: Record<string, { username: string; first_name: string; last_name: string; nickname: string }>): string {
  const user = Object.values(users).find((u) => u.username === username);
  if (!user) return username;
  if (user.nickname) return user.nickname;
  if (user.first_name || user.last_name) return `${user.first_name} ${user.last_name}`.trim();
  return user.username;
}

function renderMarkdown(
  text: string,
  users: Record<string, { username: string; first_name: string; last_name: string; nickname: string }>,
  channelsByName: Record<string, string>,
): { html: string; mermaidBlocks: string[] } {
  collectedMermaidBlocks = [];

  let processed = text
    .replace(/@([\w.-]+)/g, (_match, username) => {
      const displayName = getUserDisplayName(username, users);
      return `<span class="mention" data-username="${escapeAttr(username)}">@${escapeAttr(displayName)}</span>`;
    })
    .replace(/~([\w-]+)/g, (_match, channelName) => {
      const displayName = channelsByName[channelName] ?? channelName;
      return `<span class="channel-link" data-channel="${escapeAttr(channelName)}">~${escapeAttr(displayName)}</span>`;
    })
    // Replace :emoji_name: with unicode — skip if it looks like a custom emoji (no mapping)
    .replace(/:([a-z0-9_+-]+):/gi, (match, name) => {
      const unicode = emojiNameToUnicode(name);
      return unicode.startsWith(":") ? match : unicode;
    });

  const html = marked.parse(processed) as string;
  const mermaidBlocks = collectedMermaidBlocks;
  collectedMermaidBlocks = [];
  return { html, mermaidBlocks };
}

export function MarkdownRenderer({ text, serverId }: MarkdownRendererProps) {
  const users = useUiStore((s) => s.users);
  const channels = useUiStore((s) => s.channels);

  const [popover, setPopover] = useState<{ userId: string; anchor: HTMLElement } | null>(null);

  const channelsByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ch of channels) {
      map[ch.name] = ch.display_name || ch.name;
    }
    return map;
  }, [channels]);

  const { htmlParts, mermaidBlocks } = useMemo(() => {
    const { html, mermaidBlocks } = renderMarkdown(text, users, channelsByName);

    if (mermaidBlocks.length === 0) {
      return { htmlParts: [html], mermaidBlocks: [] };
    }

    // Split the HTML by mermaid placeholders
    const parts: string[] = [];
    let remaining = html;
    for (let i = 0; i < mermaidBlocks.length; i++) {
      const placeholder = `${MERMAID_PLACEHOLDER}${i}${MERMAID_PLACEHOLDER_END}`;
      const idx = remaining.indexOf(placeholder);
      if (idx !== -1) {
        parts.push(remaining.slice(0, idx));
        remaining = remaining.slice(idx + placeholder.length);
      }
    }
    parts.push(remaining);
    return { htmlParts: parts, mermaidBlocks };
  }, [text, users, channelsByName]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const mention = target.closest("[data-username]") as HTMLElement | null;
    if (mention) {
      const username = mention.dataset.username;
      if (username) {
        const user = Object.values(users).find((u) => u.username === username);
        if (user && serverId) {
          e.stopPropagation();
          setPopover({ userId: user.id, anchor: mention });
        }
      }
      return;
    }
    const channelLink = target.closest("[data-channel]") as HTMLElement | null;
    if (channelLink) {
      const channelName = channelLink.dataset.channel;
      if (channelName) {
        const ch = channels.find((c) => c.name === channelName);
        if (ch) {
          e.stopPropagation();
          emit("notif:navigate-channel", ch.id);
        }
      }
    }
  }, [users, channels, serverId]);

  const body = (
    <>
      {mermaidBlocks.length === 0 ? (
        <span dangerouslySetInnerHTML={{ __html: htmlParts[0] }} />
      ) : (
        htmlParts.map((html, i) => (
          <span key={i}>
            {html && <span dangerouslySetInnerHTML={{ __html: html }} />}
            {i < mermaidBlocks.length && <MermaidBlock code={mermaidBlocks[i]} />}
          </span>
        ))
      )}
      {popover && serverId && (
        <UserPopover
          userId={popover.userId}
          serverId={serverId}
          anchorEl={popover.anchor}
          onClose={() => setPopover(null)}
        />
      )}
    </>
  );

  return (
    <span className="markdown-body" onClick={handleClick}>
      {body}
    </span>
  );
}
