import { marked, Renderer } from "marked";
import { useMemo } from "react";
import { emojiNameToUnicode } from "./EmojiPicker";

interface MarkdownRendererProps {
  text: string;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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

// Code blocks with language class
renderer.code = ({ text, lang }) => {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const langClass = lang ? ` class="language-${escapeAttr(lang)}"` : "";
  return `<pre class="code-block"><code${langClass}>${escaped}</code></pre>`;
};

// Inline code
renderer.codespan = ({ text }) => {
  return `<code class="inline-code">${text}</code>`;
};

marked.setOptions({ renderer, gfm: true, breaks: true });

function renderMarkdown(text: string): string {
  let processed = text
    .replace(/@(\w+)/g, '<span class="mention">@$1</span>')
    .replace(/~([\w-]+)/g, '<span class="channel-link">~$1</span>')
    // Replace :emoji_name: with unicode — skip if it looks like a custom emoji (no mapping)
    .replace(/:([a-z0-9_+-]+):/gi, (match, name) => {
      const unicode = emojiNameToUnicode(name);
      return unicode.startsWith(":") ? match : unicode;
    });

  return marked.parse(processed) as string;
}

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <span
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
