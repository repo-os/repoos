import { describe, expect, it } from "vitest";
import { sanitizeSpawnArgs, stripNulBytes } from "../../core/spawn-args";

describe("spawn argument sanitizing (#0889)", () => {
  it("strips NUL bytes and leaves every other character untouched", () => {
    expect(stripNulBytes("before\u0000after")).toBe("beforeafter");
    expect(stripNulBytes("no nul here")).toBe("no nul here");
    expect(stripNulBytes("\u0000\u0000\u0000")).toBe("");
    expect(stripNulBytes("tab\tnewline\npath/a\0b")).toBe("tab\tnewline\npath/ab");
  });

  it("sanitizes every argument and reports how many NULs it removed", () => {
    const result = sanitizeSpawnArgs([
      "run",
      "--auto",
      "Working directory: /repo/\u0000worktree\n\u0000\u0000excerpt",
    ]);
    expect(result.args).toEqual(["run", "--auto", "Working directory: /repo/worktree\nexcerpt"]);
    expect(result.removed).toBe(3);
    expect(result.args.some((arg) => arg.includes("\u0000"))).toBe(false);
  });

  it("is a no-op for an already clean argv", () => {
    const args = ["run", "--format", "json", "do the work"];
    const result = sanitizeSpawnArgs(args);
    expect(result.args).toEqual(args);
    expect(result.removed).toBe(0);
  });
});
