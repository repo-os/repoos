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
  reapStaleFixtures("repoos-");
}
