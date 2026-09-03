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
import { reapStaleFixtures } from "../helpers";

export default function setup(): void {
  const removed = reapStaleFixtures("repoos-");
  // A steady trickle is normal (each run leaves a few dirs a torn-down worker
  // never cleaned). A big number means a test is leaking on every run — surface
  // it instead of silently absorbing it, the way the `-worktrees` orphan leak
  // went unnoticed until the tmpdir held ~18k of them.
  if (removed > 50) {
    console.warn(
      `[global-reap] removed ${removed} stale repoos-* fixture dirs from the tmpdir — ` +
        `a test is likely leaking. Check which prefix dominates ` +
        `(\`ls "$TMPDIR" | grep '^repoos-' | sed 's/-[A-Za-z0-9]\\{6\\}.*//' | sort | uniq -c | sort -rn\`).`,
    );
  }
}
