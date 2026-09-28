import { describe, expect, it } from "vitest";
import { isThematicBreakOnlyText, renderChatMarkdown, renderMarkdown } from "../src/lib/markdown";

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

  it("renders soft-wrapped prose across the available width", () => {
    expect(renderMarkdown("Source-friendly wrap\ncontinues the same paragraph.")).toBe(
      "<p>Source-friendly wrap continues the same paragraph.</p>",
    );
  });

  it("preserves explicit Markdown hard breaks", () => {
    expect(renderMarkdown("first\\\nsecond")).toBe("<p>first<br>second</p>");
    expect(renderMarkdown("first  \nsecond")).toBe("<p>first<br>second</p>");
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

  it("keeps image-looking syntax inside a code span literal", () => {
    const html = renderMarkdown("dedups by the `![alt](url)` syntax itself");
    expect(html).toContain("<code>![alt](url)</code>");
    expect(html).not.toContain("<img");
  });

  it("keeps link-looking syntax inside a code span literal", () => {
    const html = renderMarkdown("see `[label](https://example.com)` for the shape");
    expect(html).toContain("<code>[label](https://example.com)</code>");
    expect(html).not.toContain("<a href");
  });

  it("keeps emphasis- and strikethrough-looking syntax inside a code span literal", () => {
    const html = renderMarkdown("literal `**not bold**` and `*not italic*` and `~~not struck~~`");
    expect(html).toContain("<code>**not bold**</code>");
    expect(html).toContain("<code>*not italic*</code>");
    expect(html).toContain("<code>~~not struck~~</code>");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("<em>");
    expect(html).not.toContain("<del>");
  });

  it("still applies formatting outside code spans next to one", () => {
    const html = renderMarkdown("**bold** and `![x](y)` and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>![x](y)</code>");
    expect(html).toContain("<em>italic</em>");
    expect(html).not.toContain("<img");
  });

  it("renders markdown tables with header, body, and inline formatting", () => {
    const src =
      "| Model | Tier | Best for |\n" +
      "| --- | --- | --- |\n" +
      "| `opencode/deepseek-v4-flash` | 🟢 Budget | **Cheap** coder |\n" +
      "| `opencode/claude-opus-5` | 🔴 Premium | reviewer |\n";
    const html = renderMarkdown(src);
    expect(html).toContain('<div class="md-table-wrap"><table><thead><tr>');
    expect(html).toContain("<th>Model</th><th>Tier</th><th>Best for</th>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<code>opencode/deepseek-v4-flash</code>");
    expect(html).toContain("<strong>Cheap</strong>");
    expect(html).toContain("</tbody></table>");
    expect(html).toContain("<td>🟢 Budget</td>");
    expect(html).toContain("</tbody></table></div>");
  });

  it("leaves intraword underscores alone instead of italicizing them", () => {
    const html = renderMarkdown("Set my_variable_name and __private__field here.");
    expect(html).not.toContain("<em>");
    expect(html).not.toContain("<strong>");
    expect(html).toContain("my_variable_name");
    expect(html).toContain("__private__field");
  });

  it("still renders underscore emphasis at word boundaries", () => {
    const html = renderMarkdown("this is _emphasized_ and __strong__ text");
    expect(html).toContain("<em>emphasized</em>");
    expect(html).toContain("<strong>strong</strong>");
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

  it("collapses runs of three or more blank lines to a single paragraph break", () => {
    const html = renderMarkdown("step one\n\n\n\n\n\nstep two");
    expect(html).toBe("<p>step one</p><p>step two</p>");
  });

  it("strips trailing blank lines from the message", () => {
    expect(renderMarkdown("Hello\n\n\n")).toBe("<p>Hello</p>");
  });

  it("trims trailing blank lines inside fenced code but keeps interior blanks", () => {
    const trimmed = renderMarkdown("```sh\nnpm test\n\n\n\n```");
    expect(trimmed).toBe('<pre><code class="language-sh">npm test</code></pre>');

    const interior = renderMarkdown("```sh\nnpm test\n\ncd dist\n\nnpm run build\n```");
    expect(interior).toContain("npm test\n\ncd dist\n\nnpm run build");
  });

  it("renders an unterminated fence as code with no trailing blank lines", () => {
    const html = renderMarkdown("Here is the diff:\n\n```ts\nconst a = 1;\n\n\n");
    expect(html).toContain("<p>Here is the diff:</p>");
    expect(html).toBe(
      '<p>Here is the diff:</p><pre><code class="language-ts">const a = 1;</code></pre>',
    );
  });

  it("treats invisible-only lines as blank", () => {
    const html = renderMarkdown("Done.\n\u200b\n\u200b\nBye.");
    expect(html).toBe("<p>Done.</p><p>Bye.</p>");
  });
});

describe("renderChatMarkdown (#0563)", () => {
  it("omits thematic breaks so they do not render as <hr> between turns", () => {
    expect(renderChatMarkdown("Hello\n\n---\n\nWorld")).toBe("<p>Hello</p><p>World</p>");
    expect(renderChatMarkdown("---")).toBe("");
    expect(renderChatMarkdown("> ━━━━━━━━━━━━━━━━━━━━━━━━")).toBe("");
  });

  it("still renders other markdown like renderMarkdown", () => {
    expect(renderChatMarkdown("**bold**")).toBe(renderMarkdown("**bold**"));
  });
});

describe("isThematicBreakOnlyText (#0563)", () => {
  it("recognizes separator-only rows", () => {
    expect(isThematicBreakOnlyText("---")).toBe(true);
    expect(isThematicBreakOnlyText("\n---\n")).toBe(true);
    expect(isThematicBreakOnlyText("> ━━━━━━━━━━━")).toBe(true);
    expect(isThematicBreakOnlyText("Hello")).toBe(false);
    expect(isThematicBreakOnlyText("Hello\n---")).toBe(false);
  });
});

describe("renderChatMarkdown section dividers (#0563)", () => {
  it("removes hr blocks inside a longer assistant message", () => {
    expect(renderChatMarkdown("Part one\n\n---\n\nPart two")).toBe(
      "<p>Part one</p><p>Part two</p>",
    );
  });

  it("strips box-drawing rule lines inside a longer assistant message", () => {
    const html = renderChatMarkdown("Intro\n\n> ━━━━━━━━━━━━━━━━━━━━━━━━\n\nOutro");
    expect(html).toBe("<p>Intro</p><p>Outro</p>");
    expect(html).not.toContain("━");
  });
});
