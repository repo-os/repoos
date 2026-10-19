/** Per-test-file temp directory nested under global-reap's run root. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const runRoot = process.env.REPOOS_TEST_TMP_ROOT;
const base = runRoot ?? tmpdir();
const root = mkdtempSync(join(base, runRoot ? "file-" : "repoos-vitest-"));
process.env.TMPDIR = root;
process.env.TMP = root;
process.env.TEMP = root;

afterAll(() => {
  // The next file in this worker starts from the run root. Global teardown
  // removes it after all workers exit, including anything a child left behind.
  process.env.TMPDIR = base;
  process.env.TMP = base;
  process.env.TEMP = base;
  rmSync(root, { recursive: true, force: true });
});
