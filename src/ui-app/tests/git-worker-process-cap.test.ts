import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeAllGitWorkers,
  getGitWorker,
  gitWorkerChildCount,
  MAX_GIT_WORKER_CHILDREN,
} from "../../server/git-worker.js";
import { waitFor } from "./helpers";

/**
 * Git worker children that this test process started and that have not exited.
 * Filtering by parent pid keeps other vitest runs' workers (and the owner's
 * server) out of the count; zombies are excluded because they are already dead.
 */
function liveGitWorkerChildren(): number[] {
  const res = spawnSync("ps", ["-axo", "pid=,ppid=,stat=,command="], {
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return (res.stdout ?? "").split("\n").flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!match || Number(match[2]) !== process.pid || match[3].startsWith("Z")) return [];
    return match[4].includes("git-worker-entry") ? [Number(match[1])] : [];
  });
}

describe.skipIf(process.platform === "win32")("Git worker child processes", () => {
  const roots: string[] = [];

  function gitRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "repoos-git-worker-cap-"));
    roots.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    return root;
  }

  afterEach(() => {
    closeAllGitWorkers();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("leaves no git worker process running after the suite teardown closes them", async () => {
    await getGitWorker(gitRoot()).gitOverview();
    expect(liveGitWorkerChildren().length).toBeGreaterThan(0);

    closeAllGitWorkers();

    await waitFor(
      () => liveGitWorkerChildren().length === 0,
      "git worker children to exit after closeAllGitWorkers",
    );
    expect(gitWorkerChildCount()).toBe(0);
  });

  it("keeps live git worker children at or under the cap across many repositories", async () => {
    const first = gitRoot();
    for (let i = 0; i < MAX_GIT_WORKER_CHILDREN * 2; i++) {
      await getGitWorker(i === 0 ? first : gitRoot()).gitOverview();
      expect(gitWorkerChildCount()).toBeLessThanOrEqual(MAX_GIT_WORKER_CHILDREN);
    }

    // An evicted repository respawns its child on the next request.
    expect((await getGitWorker(first).gitOverview()).useGit).toBe(true);
    expect(gitWorkerChildCount()).toBeLessThanOrEqual(MAX_GIT_WORKER_CHILDREN);
  });
});
