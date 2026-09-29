import { describe, expect, it } from "vitest";
import { extractFailedTests } from "../../core/check-failure-summary.js";

describe("extractFailedTests", () => {
  it("lists each distinct failing test, ignoring colour codes and repeats", () => {
    const out = [
      "\u001b[31m FAIL \u001b[39m tests/agent-review.test.ts > reviews again > after a human returns",
      "AssertionError: timed out",
      " FAIL  tests/agent-review.test.ts > reviews again > after a human returns",
      " FAIL  tests/other.test.ts [ unit ]",
      " ✓ tests/fine.test.ts",
    ].join("\n");
    expect(extractFailedTests(out)).toEqual([
      "tests/agent-review.test.ts > reviews again > after a human returns",
      "tests/other.test.ts",
    ]);
  });

  it("returns nothing for a passing run", () => {
    expect(extractFailedTests(" ✓ tests/a.test.ts (3 tests)\n Tests 3 passed")).toEqual([]);
  });
});
