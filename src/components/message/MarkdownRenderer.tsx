import { marked, Renderer } from "marked";
import { useMemo } from "react";

interface MarkdownRendererProps {
  text: string;
}

// Custom renderer to handle Mattermost-specific elements
const renderer = new Renderer();

// Open links in system browser (target=_blank)
renderer.link = ({ href, title, text }) => {
  const titleAttr = title ? ` title="${title}"` : "";
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

// Code blocks with language class
renderer.code = ({ text, lang }) => {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const langClass = lang ? ` class="language-${lang}"` : "";
  return `<pre class="code-block"><code${langClass}>${escaped}</code></pre>`;
};

// Inline code
renderer.codespan = ({ text }) => {
  return `<code class="inline-code">${text}</code>`;
};

marked.setOptions({ renderer, gfm: true, breaks: true });

function renderMarkdown(text: string): string {
  // Pre-process @mentions and ~channel links before markdown parsing
  // (marked would otherwise alter them)
  let processed = text
    .replace(/@(\w+)/g, '<span class="mention">@$1</span>')
    .replace(/~([\w-]+)/g, '<span class="channel-link">~$1</span>');

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
