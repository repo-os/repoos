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
