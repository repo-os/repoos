/**
 * #1268 — wrapped list items, nested lists, loose lists and lazy blockquote
 * lines. Every `parseBlocks` consumer (Docs reader, story and task panels,
 * chat) goes through `renderMarkdown`, so these cases pin the shared parser.
 */
import { describe, expect, it } from "vitest";
import { renderChatMarkdown, renderMarkdown } from "../src/lib/markdown";

describe("#1268 markdown list and quote continuation", () => {
  it.each([
    [
      "a wrapped bullet stays one item",
      "- **Dropdowns:** use the styled dropdown for every new\n  dropdown in the UI.\n- **Next:** plain",
      "<ul><li><strong>Dropdowns:</strong> use the styled dropdown for every new dropdown in the UI.</li><li><strong>Next:</strong> plain</li></ul>",
    ],
    [
      "an unmarked line at the item's left edge continues the item (lazy)",
      "- first bullet\nlazy continuation\n- second",
      "<ul><li>first bullet lazy continuation</li><li>second</li></ul>",
    ],
    [
      "indented sub-bullets nest under their parent",
      "- parent\n  - child one\n  - child two\n- sibling",
      "<ul><li>parent<ul><li>child one</li><li>child two</li></ul></li><li>sibling</li></ul>",
    ],
    [
      "a blank line between items keeps one loose list",
      "- one\n\n- two",
      "<ul><li>one</li><li>two</li></ul>",
    ],
    [
      "wrapped ordered items keep their text",
      "1. first\n   wrapped\n2. second",
      "<ol><li>first wrapped</li><li>second</li></ol>",
    ],
    [
      "a wrapped task item keeps its checkbox and text",
      "- [x] done task\n  continues here",
      '<ul><li class="md-task md-task-checked"><span class="md-task-box" aria-hidden="true">☑</span><span class="md-task-text">done task continues here</span></li></ul>',
    ],
    [
      "a lazy line continues a blockquote instead of leaving it",
      "> quoted line\ncontinued lazily\n\nafter",
      "<blockquote>quoted line continued lazily</blockquote><p>after</p>",
    ],
    [
      "a bare heading marker is text and does not hang the parser",
      "# \n\nafter",
      "<p># </p><p>after</p>",
    ],
  ])("%s", (_label, source, html) => {
    expect(renderMarkdown(source)).toBe(html);
  });

  it("applies the same item rules to chat markdown", () => {
    expect(renderChatMarkdown("- a wrapped\n  bullet")).toBe("<ul><li>a wrapped bullet</li></ul>");
  });
});
