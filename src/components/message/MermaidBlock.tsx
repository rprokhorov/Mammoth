import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    darkMode: true,
    background: "#313244",
    primaryColor: "#2389d7",
    primaryTextColor: "#cdd6f4",
    primaryBorderColor: "#45475a",
    lineColor: "#a6adc8",
    secondaryColor: "#282840",
    tertiaryColor: "#1e1e2e",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  securityLevel: "strict",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

interface MermaidBlockProps {
  code: string;
}

export function MermaidBlock({ code }: MermaidBlockProps) {
  const id = useId().replace(/:/g, "_");
  const mermaidId = `mermaid${id}`;
  const [tab, setTab] = useState<"diagram" | "code">("diagram");
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        // Clean up any leftover element from a previous failed render
        const stale = document.getElementById(mermaidId);
        if (stale) stale.remove();

        const { svg } = await mermaid.render(mermaidId, code);
        if (!cancelled) {
          setSvgHtml(svg);
          setRenderError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : String(err);
          console.warn("[MermaidBlock] render failed:", msg, "\nCode:", code);
          setRenderError(msg);
          setTab("code");
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code, mermaidId]);

  return (
    <div className="mermaid-wrapper">
      <div className="mermaid-tabs">
        <button
          className={`mermaid-tab${tab === "diagram" ? " active" : ""}`}
          onClick={() => setTab("diagram")}
          disabled={renderError !== null}
        >
          Diagram
        </button>
        <button
          className={`mermaid-tab${tab === "code" ? " active" : ""}`}
          onClick={() => setTab("code")}
        >
          Code
        </button>
      </div>
      {tab === "diagram" ? (
        <div
          className="mermaid-block"
          dangerouslySetInnerHTML={{ __html: svgHtml ?? "" }}
        />
      ) : (
        <>
          {renderError && (
            <div className="mermaid-error">{renderError}</div>
          )}
          <pre className="code-block mermaid-code">
            <code className="language-mermaid">{code}</code>
          </pre>
        </>
      )}
    </div>
  );
}
