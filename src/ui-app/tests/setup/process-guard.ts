/**
 * Per-test-file teardown for helpers spawned through `spawnTestProcess()`
 * (#1017). Runs in every worker, after the test file's own `afterEach`, so a
 * failed test, skipped cleanup or timeout cannot leave a fake CLI/preview
 * server behind. The global teardown
 * (`tests/setup/global-reap.ts`) remains the backstop for processes spawned by
 * production code paths and for a worker that is killed outright.
 */
import { afterAll, afterEach } from "vitest";
import { takeTrackedTestPids, terminateTestPidsSync } from "../helpers";

afterEach(() => {
  terminateTestPidsSync(takeTrackedTestPids());
});

afterAll(async () => {
  terminateTestPidsSync(takeTrackedTestPids());
  // Git workers are per-file module state; without this each file's roots left
  // a Bun child behind until its vitest fork exited (#1281). Loaded lazily so
  // files that never touch git don't pay for the import.
  const { closeAllGitWorkers } = await import("../../../server/git-worker.js");
  closeAllGitWorkers();
});
