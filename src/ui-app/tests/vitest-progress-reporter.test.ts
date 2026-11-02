// @ts-nocheck — imports the plain-JS vitest reporter from scripts/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import RepoOSProgressReporter from "../../../scripts/vitest-progress-reporter.mjs";

describe("vitest progress reporter", () => {
  let progressDir: string;
  let stateFile: string;
  let lines: string[];

  beforeEach(() => {
    progressDir = mkdtempSync(join(tmpdir(), "repoos-progress-reporter-"));
    stateFile = join(progressDir, "state.json");
    lines = [];
    vi.stubGlobal("process", {
      ...process,
      env: {
        ...process.env,
        REPOOS_TEST_PROGRESS_STATE: stateFile,
        REPOOS_TEST_PASS: "1",
      },
      stdout: {
        write: (chunk: string) => {
          lines.push(chunk);
          return true;
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(progressDir, { recursive: true, force: true });
  });

  function lastPayload() {
    const marker = "::repoos-check-progress::";
    const line = lines.at(-1) ?? "";
    return JSON.parse(line.slice(line.indexOf(marker) + marker.length)) as {
      testsDone: number;
      testsTotal: number;
    };
  }

  it("records Vitest module duration once and emits a relative path", () => {
    const reporter = new RepoOSProgressReporter();
    const module = { id: `${process.cwd()}/slow.test.ts`, diagnostic: () => ({ duration: 1234 }) };
    reporter.onTestModuleEnd(module);
    reporter.onTestModuleEnd(module);
    const timingLines = lines.filter((line) => line.startsWith("::repoos-test-file::"));
    expect(timingLines).toHaveLength(1);
    expect(timingLines[0]).toContain('"file":"slow.test.ts","durationMs":1234');
  });

  it("records finished test cases with retry index", () => {
    const reporter = new RepoOSProgressReporter();
    const testCase = {
      id: "case-1",
      fullName: "suite > works",
      module: { moduleId: `${process.cwd()}/case.test.ts` },
      result: () => ({ state: "pass" }),
      diagnostic: () => ({ duration: 42, retryCount: 1 }),
    };
    reporter.onTestCaseResult(testCase);
    const caseLines = lines.filter((line) => line.startsWith("::repoos-test-case::"));
    expect(caseLines).toHaveLength(1);
    expect(caseLines[0]).toContain('"retry":1');
    expect(caseLines[0]).toContain('"durationMs":42');
    expect(caseLines[0]).toContain('"result":"passed"');
  });

  it("records failed, skipped, pending, and todo Vitest cases with stable outcomes", () => {
    const reporter = new RepoOSProgressReporter();
    const makeCase = (id: string, state: string) => ({
      id,
      fullName: `suite > ${id}`,
      module: { moduleId: `${process.cwd()}/cases.test.ts` },
      result: () => ({ state }),
      diagnostic: () => ({ duration: ["skip", "pending", "todo"].includes(state) ? undefined : 7 }),
    });
    reporter.onTestCaseResult(makeCase("failed", "fail"));
    reporter.onTestCaseResult(makeCase("skipped", "skip"));
    reporter.onTestCaseResult(makeCase("pending", "pending"));
    reporter.onTestCaseResult(makeCase("todo", "todo"));
    const cases = lines
      .filter((line) => line.startsWith("::repoos-test-case::"))
      .map((line) => JSON.parse(line.slice("::repoos-test-case::".length)));
    expect(cases.map((item) => [item.result, item.durationMs])).toEqual([
      ["failed", 7],
      ["skipped", 0],
      ["skipped", 0],
      ["skipped", 0],
    ]);
  });

  it("accumulates file counts across vitest passes via base offsets", () => {
    const pass1 = new RepoOSProgressReporter();
    pass1.onTestRunStart([{ id: "a" }, { id: "b" }, { id: "c" }]);
    pass1.onTestModuleEnd({ id: "a" });
    pass1.onTestModuleEnd({ id: "b" });
    pass1.onTestModuleEnd({ id: "c" });
    expect(lastPayload()).toEqual({ testsDone: 3, testsTotal: 3, testsPass: 1 });
    const afterPass1 = JSON.parse(readFileSync(stateFile, "utf8"));

    vi.stubGlobal("process", {
      ...process,
      env: {
        ...process.env,
        REPOOS_TEST_PROGRESS_STATE: stateFile,
        REPOOS_TEST_PASS: "2",
        REPOOS_TEST_BASE_DONE: String(afterPass1.testsDone),
        REPOOS_TEST_BASE_TOTAL: String(afterPass1.testsTotal),
      },
      stdout: {
        write: (chunk: string) => {
          lines.push(chunk);
          return true;
        },
      },
    });

    const pass2 = new RepoOSProgressReporter();
    pass2.onTestRunStart([{ id: "isolated" }]);
    expect(lastPayload()).toEqual({ testsDone: 3, testsTotal: 4, testsPass: 2 });
    pass2.onTestModuleEnd({ id: "isolated" });
    expect(lastPayload()).toEqual({ testsDone: 4, testsTotal: 4, testsPass: 2 });
  });
});
