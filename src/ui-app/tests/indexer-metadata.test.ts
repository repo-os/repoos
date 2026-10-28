import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { buildIndex } from "../../core/indexer.js";
import * as git from "../../core/git.js";

describe("metadata-only index reads", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads lifecycle and dependency metadata without probing git", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-metadata-index-"));
    const probe = vi.spyOn(git, "isGitRepo").mockImplementation(() => {
      throw new Error("metadata reads must not spawn git");
    });
    try {
      mkdirSync(join(root, "work"));
      writeFileSync(
        join(root, "work", "0001-task.md"),
        '---\nid: "0001"\ntitle: Task\nstatus: active\nbranch: feat/task\ndepends_on: ["0002"]\n---\nBody\n',
      );
      const index = buildIndex(loadConfig(root), { skipGit: true });
      expect(index.tasks).toHaveLength(1);
      expect(index.tasks[0]).toMatchObject({
        id: "0001",
        status: "active",
        branch: "feat/task",
        dependsOn: ["0002"],
        git: { branchExists: false, worktreeExists: false },
      });
      expect(probe).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
