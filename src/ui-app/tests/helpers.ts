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
