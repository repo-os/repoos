/** Machine-readable per-file progress consumed by RepoOS's live check stream. */
export default class RepoOSProgressReporter {
  #files = new Set();
  #completed = new Set();

  onCollected(files) {
    for (const file of files) this.#files.add(file.id);
    this.#emit();
  }

  onTaskUpdate(packs) {
    for (const [id, result] of packs) {
      if (this.#files.has(id) && (result?.state === "pass" || result?.state === "fail")) {
        this.#completed.add(id);
        this.#emit();
      }
    }
  }

  #emit() {
    process.stdout.write(
      `::repoos-check-progress::${JSON.stringify({
        testsDone: this.#completed.size,
        testsTotal: this.#files.size,
      })}\n`,
    );
  }
}
