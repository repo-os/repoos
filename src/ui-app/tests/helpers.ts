import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Shared test helpers for the process-spawning E2E fixtures (0076).
 *
 * These tests spawn real child processes (fixture CLI stubs on a fake PATH,
 * git, etc.) and poll for observable state. The old per-file `waitFor`
 * helpers polled with a hard 3s ceiling, which flaked `repoos check` under
 * load: right after a full build, or while other worktrees are building in
 * parallel, a spawn can legitimately take longer than 3s to boot, so the
 * poll threw and the whole test file failed. These helpers keep the fail-fast
 * intent (a genuinely-broken spawn still surfaces within ~10s) but give a
 * busy machine real headroom.
 */

/** Default ceiling for waitFor() polls on real spawned processes, ms. */
export const WAIT_FOR_TIMEOUT_MS = 10_000;
/** How often waitFor() re-checks, ms. Fast so healthy paths never slow down. */
export const WAIT_FOR_POLL_MS = 25;

/**
 * Poll `fn()` until it returns truthy. Throws with `label` in the message so
 * a genuinely-broken spawn is still diagnosed quickly.
 */
export async function waitFor(
  fn: () => boolean,
  label: string,
  timeoutMs = WAIT_FOR_TIMEOUT_MS,
): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, WAIT_FOR_POLL_MS));
  }
}

/**
 * Stale fixtures from a PAST run only unwound via per-test `try/finally`,
 * which never runs if the whole process is torn down (Ctrl-C, a CI job killed
 * mid-suite). Vitest's default pool runs test files in worker threads, and OS
 * signals go to the main vitest process only — it kills workers via
 * `worker.terminate()` on interrupt, so even a `process.on('SIGINT', ...)`
 * registered in a test file never fires. That gap is how 900+ of these
 * fixtures (each holding a real, deliberately-infinite fake-agent process)
 * were found leaked in `/tmp` days later (see #0185 investigation, fixed for
 * `repoos-release-` in 737f031). Self-healing on the next run is the only
 * mechanism that survives every kill path, so each fixture prefix reaps its
 * stale directories in `beforeAll` — before this suite's own fixtures exist.
 * Anything younger than the sweep age is presumed still in use by a
 * concurrently running suite and left alone.
 */
export const STALE_FIXTURE_AGE_MS = 10 * 60 * 1000;

export function reapStaleFixtures(prefix: string): void {
  let entries: string[];
  try {
    entries = readdirSync(tmpdir());
  } catch {
    return;
  }
  const cutoff = Date.now() - STALE_FIXTURE_AGE_MS;
  for (const name of entries) {
    if (!name.startsWith(prefix) || name.endsWith("-worktrees")) continue;
    const root = join(tmpdir(), name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(root).mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs >= cutoff) continue;
    try {
      const log = readFileSync(join(root, "spawns.log"), "utf8");
      for (const line of log.trim().split("\n")) {
        if (!line) continue;
        try {
          const rec = JSON.parse(line) as { pid?: number };
          if (typeof rec.pid === "number") process.kill(rec.pid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    } catch {
      /* no log — nothing to kill */
    }
    rmSync(root, { recursive: true, force: true });
    rmSync(join(tmpdir(), `${name}-worktrees`), { recursive: true, force: true });
  }
}
