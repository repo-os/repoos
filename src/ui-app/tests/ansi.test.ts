import { describe, expect, it } from "vitest";
import { parseAnsi, stripAnsi } from "../src/lib/ansi";

describe("parseAnsi", () => {
  it("colors segments, with or without the ESC byte", () => {
    const segs = parseAnsi("\u001b[32m✓\u001b[39m tests/a.test.ts [2m(2 tests)[22m");
    expect(segs[0]).toMatchObject({ text: "✓", color: "green" });
    expect(segs[1].color).toBeNull();
    expect(stripAnsi("[32m✓[39m ok")).toBe("✓ ok");
  });

  it("drops non-color escape sequences", () => {
    expect(stripAnsi("a\u001b[2Kb")).toBe("ab");
  });
});
