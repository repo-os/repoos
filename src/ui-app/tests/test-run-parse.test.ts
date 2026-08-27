import { describe, expect, it } from "vitest";
import { parseTestSummary, parseFailures, countFileResultLines } from "../src/lib/testRunParse";

// A trimmed-down but structurally real fixture, modeled on an actual
// `bun run test` failure dump (timeouts under heavy concurrent system load).
const SAMPLE_OUTPUT = `
 ✓ tests/foo.test.ts (12 tests) 340ms
 ✓ tests/bar.test.ts (4 tests) 88ms
 ❯ tests/agent-review.test.ts (9 tests | 4 failed) 123548ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/agent-review.test.ts > agent review before human sign-off (#0101) > reviews the implementation when a task lands in review and stores the report
Error: Test timed out in 15000ms.

 FAIL  tests/boot-timing.test.ts > boot timing (#0271 regression guard) > answers /api/health before startServer()'s own promise resolves
Error: Test timed out in 60000ms.

 FAIL  tests/task-watchdog.test.ts > TaskWatchdog > does not surface a task whose registry entry is gone but its worktree has fresh files (#0203)
AssertionError: expected '---\\nid: "0001"...' not to contain 'watchdog:'


 Test Files  3 failed | 100 passed (105)
      Tests  13 failed | 1132 passed | 1 skipped (1146)
   Start at  15:20:37
   Duration  590.77s (transform 1.49s, setup 228ms, import 5.11s, tests 1115.49s, environment 25.28s)

error: script "test" exited with code 1
`;

describe("parseTestSummary", () => {
  it("extracts the file/test tallies and duration from the real summary block", () => {
    const summary = parseTestSummary(SAMPLE_OUTPUT);
    expect(summary).toEqual({
      testFilesFailed: 3,
      testFilesPassed: 100,
      testFilesTotal: 105,
      testsFailed: 13,
      testsPassed: 1132,
      testsSkipped: 1,
      testsTotal: 1146,
      durationSec: 590.77,
    });
  });

  it("returns null before any summary line has appeared", () => {
    expect(parseTestSummary(" ✓ tests/foo.test.ts (12 tests) 340ms\n")).toBeNull();
  });

  it("returns null for empty output", () => {
    expect(parseTestSummary("")).toBeNull();
  });
});

describe("parseFailures", () => {
  it("extracts one entry per FAIL line, in order", () => {
    const failures = parseFailures(SAMPLE_OUTPUT);
    expect(failures).toHaveLength(3);
    expect(failures[0]).toEqual({
      file: "tests/agent-review.test.ts",
      test: "agent review before human sign-off (#0101) > reviews the implementation when a task lands in review and stores the report",
    });
    expect(failures[1].file).toBe("tests/boot-timing.test.ts");
    expect(failures[2].file).toBe("tests/task-watchdog.test.ts");
  });

  it("deduplicates an identical FAIL line seen twice", () => {
    const doubled = SAMPLE_OUTPUT + "\n FAIL  tests/agent-review.test.ts > agent review before human sign-off (#0101) > reviews the implementation when a task lands in review and stores the report\n";
    expect(parseFailures(doubled)).toHaveLength(3);
  });

  it("returns an empty array when nothing failed", () => {
    expect(parseFailures(" ✓ tests/foo.test.ts (12 tests) 340ms\n Test Files  105 passed (105)\n")).toEqual([]);
  });
});

describe("countFileResultLines", () => {
  it("counts the per-file ✓/×/❯ lines", () => {
    // 2 passed (✓) + 1 in-progress/failed (❯) in the fixture above.
    expect(countFileResultLines(SAMPLE_OUTPUT)).toBe(3);
  });

  it("returns 0 for output with no file result lines yet", () => {
    expect(countFileResultLines("")).toBe(0);
  });
});
