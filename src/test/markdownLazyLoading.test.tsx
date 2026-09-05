import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "@/components/message/MarkdownRenderer";

const { loadMermaid } = vi.hoisted(() => ({ loadMermaid: vi.fn() }));
vi.mock("@/components/message/MermaidBlock", () => {
  loadMermaid();
  return { MermaidBlock: ({ code }: { code: string }) => <div data-testid="diagram">{code}</div> };
});
afterEach(cleanup);

it("loads the diagram module only when a Mermaid block is displayed", async () => {
  const { container, rerender } = render(<MarkdownRenderer text="ordinary **message**" />);
  expect(container.querySelector("strong")?.textContent).toBe("message");
  expect(loadMermaid).not.toHaveBeenCalled();
  rerender(<MarkdownRenderer text={"```mermaid\ngraph TD; A-->B\n```"} />);
  await waitFor(() => expect(container.querySelector('[data-testid="diagram"]')?.textContent)
    .toBe("graph TD; A-->B"));
  expect(loadMermaid).toHaveBeenCalledTimes(1);
});
