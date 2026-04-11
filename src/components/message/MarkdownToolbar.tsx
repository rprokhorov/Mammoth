import { useCallback } from "react";

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  text: string;
  setText: (text: string) => void;
  disabled?: boolean;
}

type FormatAction =
  | { type: "wrap"; prefix: string; suffix: string }
  | { type: "line-prefix"; prefix: string }
  | { type: "link" }
  | { type: "code-block" };

const FORMAT_ACTIONS: Record<string, FormatAction> = {
  bold: { type: "wrap", prefix: "**", suffix: "**" },
  italic: { type: "wrap", prefix: "_", suffix: "_" },
  strikethrough: { type: "wrap", prefix: "~~", suffix: "~~" },
  heading: { type: "line-prefix", prefix: "### " },
  link: { type: "link" },
  code: { type: "code-block" },
  quote: { type: "line-prefix", prefix: "> " },
  "bulleted-list": { type: "line-prefix", prefix: "- " },
  "numbered-list": { type: "line-prefix", prefix: "1. " },
};

const TOOLBAR_BUTTONS = [
  { id: "bold", label: "B", title: "Bold (Ctrl+B)", style: { fontWeight: 700 } as React.CSSProperties },
  { id: "italic", label: "I", title: "Italic (Ctrl+I)", style: { fontStyle: "italic" } as React.CSSProperties },
  { id: "strikethrough", label: "S", title: "Strikethrough", style: { textDecoration: "line-through" } as React.CSSProperties },
  { id: "heading", label: "H", title: "Heading", style: { fontWeight: 700, fontSize: "13px" } as React.CSSProperties },
  { id: "divider1" },
  { id: "link", label: "\u{1F517}", title: "Link", style: { fontSize: "14px" } as React.CSSProperties },
  { id: "code", label: "</>", title: "Code block", style: { fontFamily: "monospace", fontSize: "11px", fontWeight: 600 } as React.CSSProperties },
  { id: "quote", label: "\u275D", title: "Quote", style: { fontSize: "14px" } as React.CSSProperties },
  { id: "divider2" },
  { id: "bulleted-list", label: "\u2022\u2261", title: "Bulleted list", style: { fontSize: "13px", letterSpacing: "-1px" } as React.CSSProperties },
  { id: "numbered-list", label: "1.", title: "Numbered list", style: { fontSize: "12px", fontWeight: 600 } as React.CSSProperties },
];

function applyMarkdownFormat(
  actionId: string,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  text: string,
  setText: (text: string) => void,
) {
  const ta = textareaRef.current;
  if (!ta) return;

  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = text.slice(start, end);
  const action = FORMAT_ACTIONS[actionId];
  if (!action) return;

  let newText: string;
  let cursorStart: number;
  let cursorEnd: number;

  switch (action.type) {
    case "wrap": {
      const wrapped = `${action.prefix}${selected || "text"}${action.suffix}`;
      newText = text.slice(0, start) + wrapped + text.slice(end);
      if (selected) {
        cursorStart = start + action.prefix.length;
        cursorEnd = cursorStart + selected.length;
      } else {
        cursorStart = start + action.prefix.length;
        cursorEnd = cursorStart + 4; // "text"
      }
      break;
    }
    case "line-prefix": {
      if (selected) {
        const lines = selected.split("\n");
        const prefixed = lines.map((line, i) => {
          if (actionId === "numbered-list") {
            return `${i + 1}. ${line}`;
          }
          return `${action.prefix}${line}`;
        }).join("\n");
        newText = text.slice(0, start) + prefixed + text.slice(end);
        cursorStart = start;
        cursorEnd = start + prefixed.length;
      } else {
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        newText = text.slice(0, lineStart) + action.prefix + text.slice(lineStart);
        cursorStart = start + action.prefix.length;
        cursorEnd = cursorStart;
      }
      break;
    }
    case "link": {
      if (selected) {
        const linkText = `[${selected}](url)`;
        newText = text.slice(0, start) + linkText + text.slice(end);
        cursorStart = start + selected.length + 3;
        cursorEnd = cursorStart + 3;
      } else {
        const linkText = "[text](url)";
        newText = text.slice(0, start) + linkText + text.slice(end);
        cursorStart = start + 1;
        cursorEnd = start + 5; // "text"
      }
      break;
    }
    case "code-block": {
      if (selected) {
        if (selected.includes("\n")) {
          const block = "```\n" + selected + "\n```";
          newText = text.slice(0, start) + block + text.slice(end);
          cursorStart = start + 4;
          cursorEnd = cursorStart + selected.length;
        } else {
          const inline = "`" + selected + "`";
          newText = text.slice(0, start) + inline + text.slice(end);
          cursorStart = start + 1;
          cursorEnd = cursorStart + selected.length;
        }
      } else {
        const block = "```\ncode\n```";
        newText = text.slice(0, start) + block + text.slice(end);
        cursorStart = start + 4;
        cursorEnd = cursorStart + 4; // "code"
      }
      break;
    }
  }

  setText(newText!);
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(cursorStart!, cursorEnd!);
  });
}

/** Handle Ctrl+B / Ctrl+I keyboard shortcuts. Returns true if handled. */
export function handleMarkdownShortcut(
  e: React.KeyboardEvent,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  text: string,
  setText: (text: string) => void,
): boolean {
  const ctrlOrMeta = e.ctrlKey || e.metaKey;
  if (!ctrlOrMeta) return false;
  let actionId: string | null = null;
  if (e.key === "b" || e.key === "B") actionId = "bold";
  else if (e.key === "i" || e.key === "I") actionId = "italic";
  if (!actionId) return false;
  e.preventDefault();
  applyMarkdownFormat(actionId, textareaRef, text, setText);
  return true;
}

export function MarkdownToolbar({ textareaRef, text, setText, disabled }: MarkdownToolbarProps) {
  const handleClick = useCallback((actionId: string) => {
    applyMarkdownFormat(actionId, textareaRef, text, setText);
  }, [textareaRef, text, setText]);

  return (
    <div className="composer-md-toolbar">
      {TOOLBAR_BUTTONS.map((btn) => {
        if (btn.id.startsWith("divider")) {
          return <span key={btn.id} className="composer-md-divider" />;
        }
        return (
          <button
            key={btn.id}
            className="composer-md-btn"
            title={btn.title}
            style={btn.style}
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              handleClick(btn.id);
            }}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
}
