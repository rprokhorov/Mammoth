import { marked, Renderer } from "marked";
import { useMemo } from "react";
import { emojiNameToUnicode } from "./EmojiPicker";
import { MermaidBlock } from "./MermaidBlock";

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

const MERMAID_PLACEHOLDER = "%%MERMAID_BLOCK_";

interface MermaidEntry {
  code: string;
}

function extractMermaidBlocks(text: string): {
  processed: string;
  mermaidBlocks: MermaidEntry[];
} {
  const mermaidBlocks: MermaidEntry[] = [];
  const processed = text.replace(
    /```mermaid\s*\n([\s\S]*?)```/g,
    (_match, code: string) => {
      const idx = mermaidBlocks.length;
      mermaidBlocks.push({ code: code.trimEnd() });
      return `${MERMAID_PLACEHOLDER}${idx}%%`;
    }
  );
  return { processed, mermaidBlocks };
}

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
  const { htmlParts, mermaidBlocks } = useMemo(() => {
    const { processed, mermaidBlocks } = extractMermaidBlocks(text);

    if (mermaidBlocks.length === 0) {
      return { htmlParts: [renderMarkdown(processed)], mermaidBlocks: [] };
    }

    const html = renderMarkdown(processed);
    // Split the HTML by mermaid placeholders
    const parts: string[] = [];
    let remaining = html;
    for (let i = 0; i < mermaidBlocks.length; i++) {
      const placeholder = `${MERMAID_PLACEHOLDER}${i}%%`;
      // marked may wrap the placeholder in <p> tags
      const wrappedPlaceholder = `<p>${placeholder}</p>`;
      const idx = remaining.indexOf(wrappedPlaceholder);
      if (idx !== -1) {
        parts.push(remaining.slice(0, idx));
        remaining = remaining.slice(idx + wrappedPlaceholder.length);
      } else {
        const plainIdx = remaining.indexOf(placeholder);
        if (plainIdx !== -1) {
          parts.push(remaining.slice(0, plainIdx));
          remaining = remaining.slice(plainIdx + placeholder.length);
        }
      }
    }
    parts.push(remaining);
    return { htmlParts: parts, mermaidBlocks };
  }, [text]);

  if (mermaidBlocks.length === 0) {
    return (
      <span
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: htmlParts[0] }}
      />
    );
  }

  return (
    <span className="markdown-body">
      {htmlParts.map((html, i) => (
        <span key={i}>
          {html && <span dangerouslySetInnerHTML={{ __html: html }} />}
          {i < mermaidBlocks.length && (
            <MermaidBlock code={mermaidBlocks[i].code} />
          )}
        </span>
      ))}
    </span>
  );
}
