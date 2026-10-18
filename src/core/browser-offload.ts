import type { RepoOSConfig } from "./types.js";

/** Set on a child `repoos check` when browser gate steps ran on the remote runner (#0836). */
export const REPOOS_BROWSER_STEPS_REMOTE = "REPOOS_BROWSER_STEPS_REMOTE";

/** Passed to `validate.sh` / the remote container when browser steps should run there (#0836). */
export const REPOOS_OFFLOAD_BROWSER_STEPS = "REPOOS_OFFLOAD_BROWSER_STEPS";

export function offloadBrowserStepsEnabled(config: RepoOSConfig): boolean {
  return (
    config.remoteValidation?.enabled === true &&
    config.remoteValidation?.offloadBrowserSteps === true
  );
}

/** Plan step names treated as Playwright browser gate work (#0836). */
export function isBrowserGateStepName(name: string): boolean {
  return name === "ui-smoke" || name === "rendered-contrast";
}

/** Skip local browser gate steps — they ran (or failed) on the remote runner already. */
export function localBrowserGateOffloaded(env: NodeJS.ProcessEnv): boolean {
  return env[REPOOS_BROWSER_STEPS_REMOTE] === "1";
}

export function browserGateOffloadSkipDetail(stepName: string): string {
  return (
    `skipped — ${stepName} ran on the remote validation runner ` +
    "(remoteValidation.offloadBrowserSteps)"
  );
}
