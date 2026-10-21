/**
 * Environment variables the remote runner injects into the `repoos-ci`
 * container (`scripts/remote-runner/validate.sh`).
 *
 * These describe the *runner* — where browser steps/capture run — not the repo
 * under test. Left set in a test worker, they leak into any `repoos check` a
 * test spawns and change which path it takes: with `REPOOS_OFFLOAD_BROWSER_STEPS`
 * set, a managed engineer check can take the offload branch instead of the
 * WIP-checkpoint fallback the test is asserting (#0905). `REPOOS_ROOT=/repo`
 * additionally makes a fixture's task id look foreign (#0870).
 *
 * `check-env.ts` clears this whole set once per test worker, and the one test
 * that deliberately exercises the managed WIP path saves, clears and restores
 * it around the run. Keep this list in sync with validate.sh — the
 * `validate-env-isolation` test fails when a new `-e REPOOS_*` line appears
 * there without being listed here.
 */
export const VALIDATE_INJECTED_ENV_KEYS = [
  "REPOOS_ROOT",
  "REPOOS_OFFLOAD_BROWSER_STEPS",
  // Set on a spawned local check by the parent after remote browser steps ran.
  // A child check spawned by a test must not inherit it either.
  "REPOOS_BROWSER_STEPS_REMOTE",
  "REPOOS_BROWSER_CAPTURE_MODE",
  "REPOOS_BROWSER_CAPTURE_TASK",
  "REPOOS_BROWSER_CAPTURE_BRANCH",
  "REPOOS_BROWSER_CAPTURE_ENTRY",
  "REPOOS_BROWSER_CAPTURE_CANONICAL",
] as const;

export type ValidateInjectedEnvKey = (typeof VALIDATE_INJECTED_ENV_KEYS)[number];

/** Delete every runner-injected variable from `env` (default `process.env`). */
export function clearValidateInjectedEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of VALIDATE_INJECTED_ENV_KEYS) delete env[key];
}
