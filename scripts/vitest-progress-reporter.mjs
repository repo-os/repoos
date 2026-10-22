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
    this.#emit();
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
