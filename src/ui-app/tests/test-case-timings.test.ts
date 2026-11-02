import { describe, expect, it } from "vitest";
import {
  TestCaseTimingCollector,
  formatSlowestTestCases,
  mergeTestCaseTimings,
  testCaseTimings,
} from "../../core/test-case-timings.js";

describe("test-case timing history", () => {
  it("parses structured markers and ignores truncated JSON", () => {
    const cases = testCaseTimings(
      '::repoos-test-case::{"file":"a.test.ts","name":"suite > fast","caseId":"c1","retry":0,"durationMs":10,"result":"passed"}\n' +
        '::repoos-test-case::{"file":"b.test.ts","name":"suite > slow","caseId":"c2","retry":0,"durationMs":900,"result":"failed"}\n' +
        "::repoos-test-case::{bad\n",
    );
    expect(cases).toHaveLength(2);
    expect(cases[1]).toMatchObject({ file: "b.test.ts", durationMs: 900, result: "failed" });
  });

  it("keeps distinct retries and parameterized names", () => {
    const merged = mergeTestCaseTimings([
      {
        file: "x.test.ts",
        name: "suite > case",
        caseId: "id-1",
        retry: 0,
        durationMs: 50,
        result: "failed",
      },
      {
        file: "x.test.ts",
        name: "suite > case",
        caseId: "id-1",
        retry: 1,
        durationMs: 40,
        result: "passed",
      },
      {
        file: "other.test.ts",
        name: "suite > case",
        caseId: "id-2",
        retry: 0,
        durationMs: 5,
        result: "passed",
      },
    ]);
    expect(merged).toHaveLength(3);
  });

  it("collector survives truncated remote chunks", () => {
    const collector = new TestCaseTimingCollector();
    collector.push('partial ::repoos-test-case::{"file":"slow.ts"');
    collector.push(
      ',"name":"s > t","caseId":"abc","retry":0,"durationMs":4000,"result":"passed"}\n',
    );
    expect(collector.values()).toEqual([
      {
        file: "slow.ts",
        name: "s > t",
        caseId: "abc",
        retry: 0,
        durationMs: 4000,
        result: "passed",
      },
    ]);
  });

  it("formats slow cases with retry note", () => {
    expect(
      formatSlowestTestCases(
        [
          {
            file: "f.ts",
            name: "a > b",
            caseId: "x",
            retry: 2,
            durationMs: 2000,
            result: "passed",
          },
        ],
        1,
      ),
    ).toContain("retry 2");
  });
});
