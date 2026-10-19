/**
 * Per-test-file TMPDIR isolation (#0858).
 *
 * A full `bun run test` used to leave ~200 `repoos-*` dirs in the shared
 * tmpdir: every fixture that forgot its own `rmSync` (built-in-agents alone
 * created one `repoos-techdebt-*` per test), every fixture whose cleanup only
 * removed the primary and orphaned its `<root>-worktrees` sibling, and every
 * file whose test aborted before its `finally`. `[global-reap]` collected them
 * on the NEXT run, but until then they slowed every fixture scan and could
 * break a run that assumes a clean tmpdir.
 *
 * Instead of auditing 40+ files by hand (and re-auditing every future one),
 * give each test FILE its own temp root under the run's root and delete it
 * when that file finishes:
 *
 *   - `tmpdir()` in a test returns `<run root>/file-XXXXXX`, so every
 *     `mkdtempSync`, `-worktrees` sibling and stray artifact lands inside this
 *     file's tree — no cross-file interference, no shared-name races between
 *     concurrently running repoos check runs.
 *   - The `afterAll` hook removes the tree even when a test threw before its
 *     own cleanup. It runs last (setup hooks register first), after the file's
 *     own teardown.
 *   - `global-reap` removes the run root itself after every worker exits, which
 *     also catches a dir a late best-effort write recreated after `afterAll`
 *     (a killed agent's exit handler persisting its session, for example) and
 *     anything a worker that died mid-file left behind.
 *
 * `os.tmpdir()` reads TMPDIR on every call, so the override applies to the
 * test file's module-scope fixtures too. The run root comes from the env var
 * `global-reap` set in its `setup`, because by the time the next file's setup
 * runs in a reused worker, TMPDIR points at the previous (already deleted)
 * tree.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const runRoot = process.env.REPOOS_TEST_TMP_ROOT;
const base = runRoot || tmpdir();

// A direct `vitest` run still gets globalSetup, so the fallback is only a
// safety net. Keep the `repoos-vitest-` prefix in it so a leftover is still
// reaped by the next run's global sweep.
const root = mkdtempSync(join(base, runRoot ? "file-" : "repoos-vitest-"));
process.env.TMPDIR = root;
process.env.TMP = root;
process.env.TEMP = root;

afterAll(() => {
  // Restore before removing so the next file in this worker starts from the
  // run root even if its setup reads TMPDIR first.
  process.env.TMPDIR = base;
  process.env.TMP = base;
  process.env.TEMP = base;
  rmSync(root, { recursive: true, force: true });
});
