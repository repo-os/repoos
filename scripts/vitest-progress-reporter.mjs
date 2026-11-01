import { relative } from "node:path";
import { writeFileSync } from "node:fs";

/** Machine-readable per-file progress consumed by RepoOS's live check stream. */
export default class RepoOSProgressReporter {
  #completed = new Set();
  #passFileCount = 0;
  #baseDone = 0;
  #baseTotal = 0;
  #stateFile = process.env.REPOOS_TEST_PROGRESS_STATE;

  constructor() {
    this.#baseDone = parseBaseInt(process.env.REPOOS_TEST_BASE_DONE);
    this.#baseTotal = parseBaseInt(process.env.REPOOS_TEST_BASE_TOTAL);
  }

  onTestRunStart(specifications) {
    this.#completed.clear();
    this.#passFileCount = specifications.length;
    this.#emit();
  }

  onTestModuleEnd(module) {
    if (this.#completed.has(module.id)) return;
    this.#completed.add(module.id);
    const durationMs = module.diagnostic?.()?.duration;
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      const file = relative(process.cwd(), module.moduleId ?? module.id).replaceAll("\\", "/");
      process.stdout.write(`::repoos-test-file::${JSON.stringify({ file, durationMs })}\n`);
    }
    this.#emit();
  }

  onTestCaseResult(testCase) {
    const result = testCase.result?.();
    if (!result || result.state === "pending" || result.state === "todo") return;
    const diagnostic = testCase.diagnostic?.();
    const durationMs = diagnostic?.duration ?? (result.state === "skip" ? 0 : undefined);
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    const outcome =
      result.state === "pass" || result.state === "passed"
        ? "passed"
        : result.state === "fail" || result.state === "failed"
          ? "failed"
          : result.state === "skip" || result.state === "skipped"
            ? "skipped"
            : null;
    if (!outcome) return;
    const moduleRef = testCase.module;
    const file = relative(process.cwd(), moduleRef?.moduleId ?? moduleRef?.id ?? "").replaceAll(
      "\\",
      "/",
    );
    if (!file) return;
    const payload = {
      file,
      name: testCase.fullName,
      caseId: testCase.id,
      retry: Number.isInteger(diagnostic?.retryCount) ? diagnostic.retryCount : 0,
      durationMs,
      result: outcome,
    };
    process.stdout.write(`::repoos-test-case::${JSON.stringify(payload)}\n`);
  }

  #emit() {
    const testsDone = this.#baseDone + this.#completed.size;
    const testsTotal = this.#baseTotal + this.#passFileCount;
    const payload = {
      testsDone,
      testsTotal,
      testsPass: Number(process.env.REPOOS_TEST_PASS) || undefined,
    };
    process.stdout.write(`::repoos-check-progress::${JSON.stringify(payload)}\n`);
    if (this.#stateFile) {
      try {
        writeFileSync(this.#stateFile, JSON.stringify(payload), "utf8");
      } catch {
        /* best-effort for run-tests.mjs between passes */
      }
    }
  }
}

function parseBaseInt(raw) {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}
