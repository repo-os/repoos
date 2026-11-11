import { describe, expect, it } from "vitest";
import { isMarkdownFenceClose } from "./markdown-fence.js";

describe("isMarkdownFenceClose", () => {
  it("closes only on a bare fence line, not an info-string opener", () => {
    expect(isMarkdownFenceClose("```", "```")).toBe(true);
    expect(isMarkdownFenceClose("```  ", "```")).toBe(true);
    expect(isMarkdownFenceClose("```md", "```")).toBe(false);
    expect(isMarkdownFenceClose("````", "```")).toBe(true);
  });
});
