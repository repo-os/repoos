import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/lib/markdown";

describe("renderMarkdown", () => {
  it("returns empty for blank input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   \n  ")).toBe("");
  });

  it("escapes raw HTML", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("renders headings, paragraphs, and emphasis", () => {
    const html = renderMarkdown("## Problem\n\nThe **spec** is *hard* to read.\n");
    expect(html).toContain("<h2>Problem</h2>");
    expect(html).toContain("<strong>spec</strong>");
    expect(html).toContain("<em>hard</em>");
  });

  it("renders fenced code blocks without inline transforms", () => {
    const html = renderMarkdown("```ts\nconst x = 1 * 2;\n```");
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain("const x = 1 * 2;");
    expect(html).not.toContain("<em>");
  });

  it("recognises Mermaid diagrams in both CommonMark fence styles", () => {
    const backticks = renderMarkdown("```mermaid\nflowchart LR\n  A --> B\n```");
    const tildes = renderMarkdown("~~~mermaid\nflowchart LR\n  A --> B\n~~~");

    expect(backticks).toBe('<div class="md-mermaid">flowchart LR\n  A --&gt; B</div>');
    expect(tildes).toBe(backticks);
  });

  it("renders task checkboxes and plain lists", () => {
    const html = renderMarkdown("- [x] done\n- [ ] todo\n- plain\n");
    expect(html).toContain('class="md-task md-task-checked"');
    expect(html).toContain('class="md-task md-task-unchecked"');
    expect(html).toContain("<li>plain</li>");
  });

  it("renders ordered lists and safe links", () => {
    const html = renderMarkdown("1. first\n2. [docs](https://example.com)\n");
    expect(html).toContain("<ol>");
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>',
    );
  });

  it("drops javascript: links", () => {
    const html = renderMarkdown("[x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain(">x</p>");
  });

  it("renders blockquotes and horizontal rules", () => {
    const html = renderMarkdown("> note\n\n---\n");
    expect(html).toContain("<blockquote>note</blockquote>");
    expect(html).toContain("<hr>");
  });

  it("renders inline code", () => {
    expect(renderMarkdown("use `repoos check`")).toContain("<code>repoos check</code>");
  });

  it("renders markdown tables with header, body, and inline formatting", () => {
    const src =
      "| Model | Tier | Best for |\n" +
      "| --- | --- | --- |\n" +
      "| `opencode/deepseek-v4-flash` | 🟢 Budget | **Cheap** coder |\n" +
      "| `opencode/claude-opus-5` | 🔴 Premium | reviewer |\n";
    const html = renderMarkdown(src);
    expect(html).toContain("<table><thead><tr>");
    expect(html).toContain("<th>Model</th><th>Tier</th><th>Best for</th>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<code>opencode/deepseek-v4-flash</code>");
    expect(html).toContain("<strong>Cheap</strong>");
    expect(html).toContain("</tbody></table>");
    expect(html).toContain("<td>🟢 Budget</td>");
  });

  it("renders images from repo-relative paths", () => {
    const html = renderMarkdown(
      "![bug](/api/tasks/0001/attachments/screenshot-1.png)\n\n[link](/work)\n",
    );
    expect(html).toContain(
      '<img src="/api/tasks/0001/attachments/screenshot-1.png" alt="bug" loading="lazy">',
    );
    expect(html).toContain('<a href="/work"');
  });

  it("renders https images and drops javascript: sources", () => {
    const ok = renderMarkdown("![shot](https://example.com/a.png)");
    expect(ok).toContain('<img src="https://example.com/a.png"');
    const bad = renderMarkdown("![x](javascript:alert(1))");
    expect(bad).not.toContain("javascript:");
  });
});
