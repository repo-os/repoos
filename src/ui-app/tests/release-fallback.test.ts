/**
 * Release-marking fallback when the live index misses (#0195, 2026-08-15).
 *
 * Observed live: publish succeeded — main was fast-forwarded to the validated
 * candidate — but the cleanup phase's `getTask(id)` (the live index's
 * in-memory lookup) returned nothing, so `markTaskReleased` never ran. No
 * error was thrown or logged; the task was silently left `review` forever,
 * published but never marked done. The live index's rebuild after a reload is
 * not instant, and this step can land in that window.
 *
 * The fix falls back to locating the task file directly on disk by id when
 * the index lookup misses, independent of index freshness.
 */
import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobCoordinator } from "../../server/integration-job.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-release-fallback-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "init.defaultBranch", "main"]);
  mkdirSync(join(root, "work"));
  writeFileSync(
    join(root, "work", "T1-test-task.md"),
    `---\nid: "T1"\ntitle: Test\ntype: feature\nstatus: review\npriority: p2\narea: core\nassigned_to: ""\ncreated_at: "2026-01-01T00:00:00Z"\nupdated_at: "2026-01-01T00:00:00Z"\n---\n## Problem\n\ntest\n`,
  );
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["branch", "-M", "main"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

describe("release-marking fallback when the live index misses (#0195)", () => {
  it("marks the task released via a direct on-disk lookup when getTask returns nothing", async () => {
    const { root, clean } = makeRepo();
    try {
      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id: "T1", branch: "feat/t1" } as any);
      coordinator.updateJob("T1", { phase: "cleanup" });

      // No getTask callback passed at all — reproduces the index-miss case
      // exactly (server.ts wires `(id) => index.getTask(id)`, which returns
      // undefined on a miss; omitting it here is the same `undefined` result).
      const orchestrator = new CloseOutOrchestrator(
        { root, workDir: "work", defaultStatus: "inbox", defaultAssignee: "unassigned" } as RepoOSConfig,
        coordinator,
        createRepositoryLock(root),
      );

      const result = await orchestrator.processNext();
      expect(result.ok).toBe(true);

      const content = readFileSync(join(root, "work", "T1-test-task.md"), "utf8");
      expect(content).toMatch(/status: done/);
      expect(content).toMatch(/release:success/);
    } finally {
      clean();
    }
  });

  it("still uses the index's task when getTask does resolve (the common path)", async () => {
    const { root, clean } = makeRepo();
    try {
      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id: "T1", branch: "feat/t1" } as any);
      coordinator.updateJob("T1", { phase: "cleanup" });

      const absPath = join(root, "work", "T1-test-task.md");
      const orchestrator = new CloseOutOrchestrator(
        { root, workDir: "work", defaultStatus: "inbox", defaultAssignee: "unassigned" } as RepoOSConfig,
        coordinator,
        createRepositoryLock(root),
        createRootLock(root),
        (id) => (id === "T1" ? ({ absPath } as any) : null),
      );

      const result = await orchestrator.processNext();
      expect(result.ok).toBe(true);

      const content = readFileSync(absPath, "utf8");
      expect(content).toMatch(/status: done/);
    } finally {
      clean();
    }
  });

  it("logs instead of silently skipping when the task cannot be found anywhere", async () => {
    const { root, clean } = makeRepo();
    try {
      const coordinator = createJobCoordinator(root);
      // A taskId with no matching file on disk at all.
      coordinator.enqueue({ id: "GHOST", branch: "feat/ghost" } as any);
      coordinator.updateJob("GHOST", { phase: "cleanup" });

      const orchestrator = new CloseOutOrchestrator(
        { root, workDir: "work", defaultStatus: "inbox", defaultAssignee: "unassigned" } as RepoOSConfig,
        coordinator,
        createRepositoryLock(root),
      );

      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await orchestrator.processNext();
      expect(result.ok).toBe(true); // cleanup itself never fails the job
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Could not locate task GHOST"));
      errSpy.mockRestore();
    } finally {
      clean();
    }
  });
});
