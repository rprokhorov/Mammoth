import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarkdownRenderer, sanitizeHtml } from "@/components/message/MarkdownRenderer";

describe("MarkdownRenderer", () => {
  describe("XSS protection", () => {
    it("strips raw <script> tags from message text", () => {
      const { container } = render(
        <MarkdownRenderer text={'hello <script>window.hacked = true</script> world'} />
      );
      expect(container.querySelector("script")).toBeNull();
      expect(container.textContent).toContain("hello");
      expect(container.textContent).toContain("world");
    });

    it("strips event handler attributes from raw HTML", () => {
      const { container } = render(
        <MarkdownRenderer text={'<img src=x onerror="window.hacked = true">'} />
      );
      const img = container.querySelector("img");
      // The tag itself may survive sanitization, but the handler must not
      if (img) {
        expect(img.getAttribute("onerror")).toBeNull();
      }
      expect(container.innerHTML).not.toContain("onerror");
    });

    it("strips iframe/object/embed elements", () => {
      const { container } = render(
        <MarkdownRenderer text={'<iframe src="https://evil.example"></iframe><object></object><embed>'} />
      );
      expect(container.querySelector("iframe")).toBeNull();
      expect(container.querySelector("object")).toBeNull();
      expect(container.querySelector("embed")).toBeNull();
    });

    it("blocks javascript: links", () => {
      const { container } = render(
        <MarkdownRenderer text={"[click me](javascript:alert(1))"} />
      );
      const link = container.querySelector("a");
      if (link) {
        expect(link.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
      }
    });

    it("escapes HTML inside inline code", () => {
      const { container } = render(
        <MarkdownRenderer text={"`<b>not bold</b>`"} />
      );
      const code = container.querySelector("code.inline-code");
      expect(code).not.toBeNull();
      expect(code!.querySelector("b")).toBeNull();
      expect(code!.textContent).toBe("<b>not bold</b>");
    });

    it("escapes HTML inside fenced code blocks", () => {
      const { container } = render(
        <MarkdownRenderer text={"```\n<script>bad()</script>\n```"} />
      );
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("pre.code-block")?.textContent).toContain("<script>");
    });
  });

  describe("legitimate markup survives sanitization", () => {
    it("keeps links with target and rel", () => {
      const { container } = render(
        <MarkdownRenderer text={"[site](https://example.com)"} />
      );
      const link = container.querySelector("a")!;
      expect(link.getAttribute("href")).toBe("https://example.com");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    });

    it("keeps mention spans with data attributes", () => {
      const { container } = render(<MarkdownRenderer text={"hi @someuser"} />);
      const mention = container.querySelector("span.mention");
      expect(mention).not.toBeNull();
      expect(mention!.getAttribute("data-username")).toBe("someuser");
    });

    it("renders basic markdown formatting", () => {
      const { container } = render(<MarkdownRenderer text={"**bold** and _italic_"} />);
      expect(container.querySelector("strong")).not.toBeNull();
      expect(container.querySelector("em")).not.toBeNull();
    });
  });

  describe("code blocks are not preprocessed", () => {
    it("does not convert @mentions inside inline code", () => {
      const { container } = render(<MarkdownRenderer text={"use `@someuser` here"} />);
      const code = container.querySelector("code.inline-code");
      expect(code).not.toBeNull();
      expect(code!.textContent).toBe("@someuser");
      expect(code!.querySelector(".mention")).toBeNull();
    });

    it("does not convert mentions or emoji inside fenced code blocks", () => {
      const { container } = render(
        <MarkdownRenderer text={"```\n@someuser :smile: ~town-square\n```"} />
      );
      const pre = container.querySelector("pre.code-block");
      expect(pre).not.toBeNull();
      expect(pre!.textContent).toContain("@someuser");
      expect(pre!.textContent).toContain(":smile:");
      expect(pre!.textContent).toContain("~town-square");
      expect(pre!.querySelector(".mention")).toBeNull();
    });

    it("still converts mentions outside code", () => {
      const { container } = render(
        <MarkdownRenderer text={"@someuser wrote `@literal`"} />
      );
      expect(container.querySelector("span.mention")).not.toBeNull();
      expect(container.querySelector("code.inline-code")!.textContent).toBe("@literal");
    });

    it("converts :emoji: to unicode outside code", () => {
      const { container } = render(<MarkdownRenderer text={"hi :smile:"} />);
      expect(container.textContent).not.toContain(":smile:");
    });
  });

  describe("sanitizeHtml", () => {
    it("removes disallowed tags but keeps content", () => {
      expect(sanitizeHtml("<script>x()</script>ok")).toBe("ok");
    });

    it("keeps class and data attributes on spans", () => {
      const html = '<span class="mention" data-username="bob">@bob</span>';
      expect(sanitizeHtml(html)).toBe(html);
    });
  });
});
