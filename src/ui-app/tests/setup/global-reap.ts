/**
 * Global Vitest setup (runs once for the whole test run, before any test
 * file starts — see vite.config.ts's `globalSetup`).
 *
 * Sweeps every `repoos-*`-prefixed fixture directory left in the OS tmpdir
 * by a PREVIOUS run that never reached its own cleanup: several test files
 * (release-agent, pause-resume, agent-review, task-watchdog, and others)
 * spawn a real, long-lived fake-agent child process and rely on a
 * try/finally to kill it when the test ends. That works for an ordinary
 * pass/fail, but not when the whole worker process is torn down before the
 * `finally` can run — an outer timeout (check.ts, handoff.ts,
 * integration-orchestrator.ts all SIGKILL a `repoos check` subprocess that
 * overruns its budget) or Ctrl-C. The child survives, reparents to init,
 * and sits there indefinitely.
 *
 * A few of those files already call `reapStaleFixtures(prefix)` in their own
 * `beforeAll` to self-heal on their NEXT run — but that only helps if that
 * specific file runs again soon (not guaranteed, especially under
 * `--changed` scoping), and it was never applied to every file that uses
 * the same spawn-and-cleanup pattern. Sweeping the shared `repoos-` root
 * here, once, covers all of them in one place — including any future test
 * file that adopts the same fixture convention — so this gap can't
 * silently reopen per-file again.
 */
import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { killSpawnedLogs, reapStaleFixtures, STALE_FIXTURE_AGE_MS } from "../helpers";

/**
 * Every file's isolated tmpdir (see tmp-isolation.ts) lives under this run's
 * root, and `teardown` removes it after all workers have exited. This catches
 * dirs a worker left behind after a failed test or abrupt exit.
 */
let runRoot: string | undefined;
let runRootHeartbeat: ReturnType<typeof setInterval> | undefined;

export async function setup(): Promise<void> {
  const removed = reapStaleFixtures("repoos-");
  // A normal run now leaves nothing behind (each test file's tmpdir is
  // isolated and the run root is removed at teardown), so the only expected
  // residue is a handful from a worker that was killed mid-file. A big number
  // means a leak source is back — surface it instead of silently absorbing it,
  // the way the `-worktrees` orphan leak went unnoticed until the tmpdir held
  // ~18k of them.
  if (removed > 50) {
    console.warn(
      `[global-reap] removed ${removed} stale repoos-* fixture dirs from the tmpdir — ` +
        `a test is likely leaking. Check which prefix dominates ` +
        `(\`ls "$TMPDIR" | grep '^repoos-' | sed 's/-[A-Za-z0-9]\\{6\\}.*//' | sort | uniq -c | sort -rn\`).`,
    );
  }

  // Workers use this run-scoped parent for their per-file temp roots.
  runRoot = mkdtempSync(join(tmpdir(), "repoos-vitest-"));
  process.env.REPOOS_TEST_TMP_ROOT = runRoot;
  // Nested fixture writes do not necessarily update the run root's mtime. Keep
  // a long-running worker's root younger than the stale-age gate so a
  // concurrent test run cannot reap its live fixtures.
  runRootHeartbeat = setInterval(
    () => {
      if (!runRoot) return;
      const now = new Date();
      try {
        utimesSync(runRoot, now, now);
      } catch {
        /* teardown may already have removed it */
      }
    },
    Math.floor(STALE_FIXTURE_AGE_MS / 3),
  );
  runRootHeartbeat.unref();
}

/** Kill recorded fixture processes, then remove the root after every worker exits. */
export async function teardown(rootOverride?: string): Promise<void> {
  const root = rootOverride ?? runRoot ?? process.env.REPOOS_TEST_TMP_ROOT;
  if (!root) return;
  if (!rootOverride && runRootHeartbeat) {
    clearInterval(runRootHeartbeat);
    runRootHeartbeat = undefined;
  }
  // Per-file afterAll normally removes fixtures, but a killed worker can leave
  // both its spawns.log and live fake agents here. Reap pids before deleting
  // the only remaining record of them.
  killSpawnedLogs(root);
  rmSync(root, { recursive: true, force: true });
  if (!rootOverride) delete process.env.REPOOS_TEST_TMP_ROOT;
}
