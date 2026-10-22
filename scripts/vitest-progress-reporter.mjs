/** Machine-readable per-file progress consumed by RepoOS's live check stream. */
export default class RepoOSProgressReporter {
  #completed = new Set();
  #total = 0;

  onTestRunStart(specifications) {
    this.#total = specifications.length;
    this.#emit();
  }

  onTestModuleEnd(module) {
    if (this.#completed.has(module.id)) return;
    this.#completed.add(module.id);
    this.#emit();
  }

  #emit() {
    process.stdout.write(
      `::repoos-check-progress::${JSON.stringify({
        testsDone: this.#completed.size,
        testsTotal: this.#total ?? 0,
        testsPass: Number(process.env.REPOOS_TEST_PASS) || undefined,
      })}\n`,
    );
  }
}
