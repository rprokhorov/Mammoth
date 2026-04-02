interface MarkdownRendererProps {
  text: string;
}

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  const html = renderMarkdown(text);
  return (
    <span
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(text: string): string {
  // Split into code blocks vs normal text
  const parts: string[] = [];
  let remaining = text;

  // Handle fenced code blocks: ```lang\ncode\n```
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderInline(remaining.slice(lastIndex, match.index)));
    }
    const lang = escapeHtml(match[1]);
    const code = escapeHtml(match[2].trimEnd());
    parts.push(
      `<pre class="code-block"><code${lang ? ` class="language-${lang}"` : ""}>${code}</code></pre>`,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < remaining.length) {
    parts.push(renderInline(remaining.slice(lastIndex)));
  }

  return parts.join("");
}

function renderInline(text: string): string {
  let result = escapeHtml(text);

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(
    /(?<!\w)_(.+?)_(?!\w)/g,
    "<em>$1</em>",
  );

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Auto-link URLs
  result = result.replace(
    /(?<!["\w])(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // @mentions
  result = result.replace(
    /@(\w+)/g,
    '<span class="mention">@$1</span>',
  );

  // ~channel links
  result = result.replace(
    /~(\w[\w-]*)/g,
    '<span class="channel-link">~$1</span>',
  );

  // Newlines
  result = result.replace(/\n/g, "<br>");

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
